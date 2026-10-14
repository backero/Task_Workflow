"""Meesho Robo: state rules, the run log, and that the scheduler no longer hides failures."""
from datetime import datetime, timedelta

import pytest

from app import database as db
from app import robot

NOW = datetime(2026, 9, 25, 12, 0, 0)


def run(status, minutes_ago, detail=""):
    return {"status": status, "detail": detail, "finished_at": (NOW - timedelta(minutes=minutes_ago)).isoformat()}


def test_demo_and_manual_are_labelled_not_called_healthy():
    assert robot.derive_state("demo", False, {}, None, NOW)[0] == "demo"
    assert robot.derive_state("manual", False, {}, None, NOW)[0] == "manual"


def test_auto_mode_states():
    """The headline state tracks panel_read (the keeper's real data source), not the older auto_pull catalog
    scrape - auto_pull's near-permanent 'no data' state (its selectors were never calibrated) must not mask a
    working panel_read, and a working auto_pull must not paper over a broken panel_read either."""
    started = (NOW - timedelta(minutes=5)).isoformat()
    assert robot.derive_state("auto", False, {}, started, NOW)[0] == "needs_you"                      # never signed in
    assert robot.derive_state("auto", True, {}, started, NOW)[0] == "attention"                        # signed in, no read yet
    assert robot.derive_state("auto", True, {"panel_read": run("ok", 10)}, started, NOW)[0] == "healthy"
    assert robot.derive_state("auto", True, {"panel_read": run("partial", 10, "read 1 of 4 areas")}, started, NOW)[0] == "attention"
    state, msg = robot.derive_state("auto", True, {"panel_read": run("needs_you", 10, "ended the Supplier Panel login")}, started, NOW)
    assert state == "needs_you" and "ended the Supplier Panel login" in msg
    state, msg = robot.derive_state("auto", True, {"panel_read": run("failed", 10, "selector_mismatch")}, started, NOW)
    assert state == "error" and "selector_mismatch" in msg
    assert robot.derive_state("auto", True, {"panel_read": run("ok", 240 * 2.5 + 11)}, started, NOW)[0] == "error"   # overdue
    old_start = (NOW - timedelta(hours=11)).isoformat()
    assert robot.derive_state("auto", True, {}, old_start, NOW)[0] == "error"                          # never read in 11 h
    # a working auto_pull alone (panel_read absent) does not make the headline "healthy" - it is not the real data source
    assert robot.derive_state("auto", True, {"auto_pull": run("ok", 10)}, started, NOW)[0] == "attention"


@pytest.fixture()
def conn(tmp_path):
    c = db.get_conn(str(tmp_path / "t.db"))
    db.init_db(c)
    yield c
    c.close()


def test_run_log_records_and_prunes(conn):
    robot.record_run(conn, "recompute", datetime.now(), "ok", "3 new findings")
    old = (datetime.now() - timedelta(days=robot.KEEP_DAYS + 1)).isoformat(timespec="seconds")
    conn.execute("INSERT INTO robot_runs (job, started_at, finished_at, status, detail) VALUES ('recompute', ?, ?, 'ok', '')", (old, old))
    conn.commit()
    robot.record_run(conn, "recompute", datetime.now(), "ok", "again")
    assert conn.execute("SELECT COUNT(*) FROM robot_runs").fetchone()[0] == 2


def test_scheduler_reports_a_missing_login_and_a_crash(tmp_path, monkeypatch):
    import app.config as config
    from app import scheduler
    from app.connector import meesho_connector

    class FakeApp:
        config = {"database_path": str(tmp_path / "s.db")}

    c = db.get_conn(FakeApp.config["database_path"])
    db.init_db(c)
    c.close()
    monkeypatch.setattr(scheduler, "get", lambda key, default=None: "auto" if key == "mode" else default)

    monkeypatch.setattr(meesho_connector, "session_exists", lambda: False)
    scheduler._auto_pull(FakeApp)
    monkeypatch.setattr(meesho_connector, "session_exists", lambda: True)
    monkeypatch.setattr(meesho_connector, "pull_all", lambda conn, cfg: (_ for _ in ()).throw(RuntimeError("boom")))
    scheduler._auto_pull(FakeApp)
    monkeypatch.setattr(meesho_connector, "pull_all", lambda conn, cfg: {"ok": False, "listings": 0, "detail": "redirected to login; session expired"})
    monkeypatch.setattr(scheduler, "_recompute", lambda app: None)
    scheduler._auto_pull(FakeApp)

    c = db.get_conn(FakeApp.config["database_path"])
    rows = [(r["status"], r["detail"]) for r in c.execute("SELECT status, detail FROM robot_runs WHERE job = 'auto_pull' ORDER BY id")]
    c.close()
    assert rows[0][0] == "needs_you" and "Connect" in rows[0][1]
    assert rows[1][0] == "failed" and "RuntimeError: boom" in rows[1][1]      # used to vanish (except: pass)
    assert rows[2][0] == "needs_you" and "session expired" in rows[2][1]


def test_robot_endpoint_and_page(tmp_path, monkeypatch):
    from flask import Flask

    from app.routes.api import api
    from app.routes.views import views

    import os
    import app as app_pkg
    flask_app = Flask("t", template_folder=os.path.join(os.path.dirname(app_pkg.__file__), "templates"),
                      static_folder=os.path.join(os.path.dirname(app_pkg.__file__), "static"))
    flask_app.config["database_path"] = str(tmp_path / "e.db")
    c = db.get_conn(flask_app.config["database_path"])
    db.init_db(c)
    robot.set_kv(c, "robot_beat", robot.now_iso())
    robot.record_run(c, "recompute", datetime.now(), "ok", "0 new findings, 0 alerts sent.")
    c.close()
    flask_app.register_blueprint(views)
    flask_app.register_blueprint(api, url_prefix="/api")
    import app.config as config
    monkeypatch.setattr(config, "get", lambda key, default=None: "demo" if key == "mode" else default)

    client = flask_app.test_client()
    body = client.get("/api/robot").get_json()
    assert body["name"] == "Meesho Robo" and body["state"] == "demo" and len(body["jobs"]) == 4
    assert body["jobs"][2]["last_status"] == "ok" and body["runs"][0]["job"] == "recompute"
    page = client.get("/robot")
    assert page.status_code == 200 and b"Meesho Robo" in page.data
