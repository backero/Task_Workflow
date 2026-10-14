"""SD Robo: state rules, run-outcome classification, and that a broken sync is now visible instead of only
landing in a sync_log nobody watches by default."""
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import database as db, robot, scheduler

NOW = datetime(2026, 9, 26, 12, 0, 0)


def run(status, minutes_ago, detail=""):
    return {"status": status, "detail": detail, "finished_at": (NOW - timedelta(minutes=minutes_ago)).isoformat()}


def test_demo_mode_is_labelled_not_called_healthy():
    assert robot.derive_state("demo", True, {}, None, NOW)[0] == "demo"


def test_live_mode_states():
    started = (NOW - timedelta(minutes=5)).isoformat()
    assert robot.derive_state("browser", False, {}, started, NOW)[0] == "attention"            # started, no sync yet
    assert robot.derive_state("browser", False, {"sync": run("ok", 5)}, started, NOW)[0] == "healthy"
    assert robot.derive_state("browser", False, {"sync": run("partial", 5, "listings failed")}, started, NOW)[0] == "attention"
    state, msg = robot.derive_state("browser", False, {"sync": run("needs_you", 5, "Session expired or missing.")}, started, NOW)
    assert state == "needs_you" and "Session expired" in msg
    state, msg = robot.derive_state("browser", False, {"sync": run("failed", 5, "boom")}, started, NOW)
    assert state == "error" and "boom" in msg
    assert robot.derive_state("browser", False, {"sync": run("ok", 240 * 2.5 + 11)}, started, NOW)[0] == "error"  # overdue
    old_start = (NOW - timedelta(hours=11)).isoformat()
    assert robot.derive_state("browser", False, {}, old_start, NOW)[0] == "error"


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB", str(tmp_path / "t.db"))
    db.init()
    yield


def test_run_log_records_and_prunes(fresh_db):
    db.record_run("sync", NOW.isoformat(), "ok", "3 listings")
    old = (NOW - timedelta(days=31)).isoformat()
    with db.conn() as c:
        c.execute("INSERT INTO robot_runs(job,started_at,finished_at,status,detail) VALUES ('sync',?,?,'ok','')", (old, old))
    db.record_run("sync", NOW.isoformat(), "ok", "again")
    assert len(db.q("SELECT * FROM robot_runs")) == 2   # the 31-day-old row was pruned


def test_classify_all_ok_all_failed_partial_and_session_expired():
    ok = {"connector": "demo", "parts": {"listings": 8, "metrics": 240, "scorecard": "ok", "ads": 90}}
    assert scheduler._classify(ok)[0] == "ok"

    partial = {"connector": "csv", "parts": {"listings": 8, "metrics": "FAILED: bad column", "scorecard": "ok", "ads": 90}}
    assert scheduler._classify(partial)[0] == "partial"

    broken = {"connector": "api", "parts": {"listings": "FAILED: 500", "metrics": "FAILED: 500", "scorecard": "FAILED: 500", "ads": "FAILED: 500"}}
    assert scheduler._classify(broken)[0] == "failed"

    expired = {"connector": "browser", "parts": {k: "FAILED: Session expired or missing. Run: python -m app.connectors.login"
                                                  for k in ("listings", "metrics", "scorecard", "ads")}}
    status, detail = scheduler._classify(expired)
    assert status == "needs_you" and "Session expired" in detail


def test_sync_now_with_demo_connector_records_ok(fresh_db, monkeypatch):
    monkeypatch.setenv("SD_CONNECTOR", "demo")
    scheduler.sync_now()
    rows = db.q("SELECT * FROM robot_runs WHERE job='sync'")
    assert len(rows) == 1 and rows[0]["status"] == "ok"


def test_sync_now_records_needs_you_when_the_session_is_dead(fresh_db, monkeypatch):
    class DeadSessionConnector:
        name = "api"
        is_demo = False
        def fetch_listings(self): raise RuntimeError("Session expired or missing. Run: python -m app.connectors.login")
        def fetch_metrics(self, days=30): raise RuntimeError("Session expired or missing. Run: python -m app.connectors.login")
        def fetch_scorecard(self): raise RuntimeError("Session expired or missing. Run: python -m app.connectors.login")
        def fetch_ads(self, days=30): raise RuntimeError("Session expired or missing. Run: python -m app.connectors.login")

    monkeypatch.setattr(scheduler, "get_connector", lambda: DeadSessionConnector())
    scheduler.sync_now()
    row = db.q("SELECT * FROM robot_runs WHERE job='sync'")[0]
    assert row["status"] == "needs_you" and "Session expired" in row["detail"]


def test_robot_api_endpoint(fresh_db, monkeypatch):
    from fastapi.testclient import TestClient
    monkeypatch.setenv("SD_CONNECTOR", "demo")
    db.record_run("sync", NOW.isoformat(), "ok", "8 listings")
    db.set_setting("robot_beat", db.now())
    from app.main import app
    client = TestClient(app, raise_server_exceptions=False)
    body = client.get("/api/robot").json()
    assert body["name"] == "SD Robo" and body["state"] == "demo" and len(body["jobs"]) == 4


def test_browser_mode_sync_reports_the_keepers_latest_read_and_never_opens_a_browser(fresh_db, monkeypatch):
    class BrowserNameOnly:
        name = "browser"
        is_demo = False
        def __getattr__(self, item):
            raise AssertionError("browser mode must not call " + item)

    monkeypatch.setattr(scheduler, "get_connector", lambda: BrowserNameOnly())
    scheduler.sync_now()
    row = db.q("SELECT * FROM robot_runs WHERE job='sync' ORDER BY id DESC")[0]
    assert row["status"] == "needs_you" and "sign in" in row["detail"].lower()

    db.record_run("panel_read", NOW.isoformat(), "ok", "Read 4 areas: dashboard, catalog, orders, returns.")
    scheduler.sync_now()
    row = db.q("SELECT * FROM robot_runs WHERE job='sync' ORDER BY id DESC")[0]
    assert row["status"] == "ok" and "Read 4 areas" in row["detail"]
