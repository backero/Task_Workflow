"""Flipkart Robo: run log, state derivation, heartbeat / silence."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta

from fkpulse import robot

CFG = {"polling": {"api_minutes": 30, "rank_runs_per_day": 3}, "sellerhub": {"enabled": True, "minutes": 180}, "harvester": {"enabled": False}}
NOW = datetime(2026, 9, 25, 12, 0, 0)


def _run(status="ok", minutes_ago=5, detail=""):
    return {"status": status, "detail": detail, "finished_at": (NOW - timedelta(minutes=minutes_ago)).isoformat(), "duration_s": 3.0}


def _all_ok():
    return {"api_sync": _run(minutes_ago=10), "hub_read": _run(minutes_ago=60), "digest": _run(minutes_ago=300)}


def test_all_jobs_on_schedule_is_healthy():
    v = robot.derive_state(CFG, _all_ok(), NOW.isoformat(), NOW)
    assert v["state"] == "healthy"
    assert [j["id"] for j in v["jobs"] if j["enabled"]] == ["api_sync", "hub_read", "hub_keepalive", "digest", "ai_analysis"]   # rank_scan is off


def test_needs_you_beats_failed_and_carries_the_reason():
    latest = _all_ok()
    latest["hub_read"] = _run("needs_you", detail="Flipkart ended the Seller Hub login - sign in again")
    latest["api_sync"] = _run("failed", detail="boom")
    v = robot.derive_state(CFG, latest, NOW.isoformat(), NOW)
    assert v["state"] == "needs_you"
    assert "Seller Hub" in v["message"] and "sign in again" in v["message"]


def test_failed_job_is_an_error_and_partial_is_attention():
    """hub_read is the real data source and drives error/needs_you on its own. digest is supplementary (it just
    recomputes recommendations from data hub_read already collected) - a broken digest is real but must read as
    'attention', not 'error', while hub_read itself is fine."""
    latest = _all_ok()
    latest["digest"] = _run("failed", detail="no such table")
    v = robot.derive_state(CFG, latest, NOW.isoformat(), NOW)
    assert v["state"] == "attention" and "no such table" in v["message"]
    latest["digest"] = _run()
    latest["hub_read"] = _run("partial", detail="missed ads")
    v = robot.derive_state(CFG, latest, NOW.isoformat(), NOW)
    assert v["state"] == "attention" and "missed ads" in v["message"]


def test_overdue_job_is_an_error_and_never_run_counts_from_robot_start():
    """api_sync overdue is supplementary (Seller Hub already covers the same ground) -> attention, not error.
    An overdue hub_read (the real data source) still is an error - see test_needs_you_beats_failed_and_carries_the_reason
    style coverage below via a dedicated hub_read overdue case."""
    latest = _all_ok()
    latest["api_sync"] = _run(minutes_ago=30 * 2.5 + 11)            # just past 2.5 intervals + grace
    v = robot.derive_state(CFG, latest, NOW.isoformat(), NOW)
    assert v["state"] == "attention" and "API sync" in v["message"]
    latest["hub_read"] = _run(minutes_ago=180 * 2.5 + 11)           # hub_read itself overdue -> error, regardless of api_sync
    v = robot.derive_state(CFG, latest, NOW.isoformat(), NOW)
    assert v["state"] == "error" and "Seller Hub read" in v["message"]
    # nothing ever ran, robot only just started -> not overdue yet
    assert robot.derive_state(CFG, {}, NOW.isoformat(), NOW)["state"] == "healthy"
    # nothing ever ran and it started 8 hours ago -> the 180-minute hub_read is overdue (api_sync alone would only be "attention")
    assert robot.derive_state(CFG, {}, (NOW - timedelta(hours=8)).isoformat(), NOW)["state"] == "error"


def test_switched_off_jobs_are_never_flagged():
    cfg = {**CFG, "sellerhub": {"enabled": False}}
    latest = _all_ok()
    latest["hub_read"] = _run("failed", detail="x", minutes_ago=9999)
    assert robot.derive_state(cfg, latest, NOW.isoformat(), NOW)["state"] == "healthy"


def test_tracked_records_ok_tuple_and_exception(tmp_path):
    db = str(tmp_path / "t.db")
    robot.tracked("digest", lambda c, d: ("ok", "3 KPI snapshots"))(CFG, db)
    robot.tracked("api_sync", lambda c, d: (_ for _ in ()).throw(RuntimeError("network down")))(CFG, db)   # raises
    robot.tracked("hub_read", lambda c, d: None)(CFG, db)                                                  # None = ok
    conn = sqlite3.connect(db)
    rows = {r[0]: (r[1], r[2]) for r in conn.execute("SELECT job, status, detail FROM robot_runs")}
    assert rows["digest"] == ("ok", "3 KPI snapshots")
    assert rows["api_sync"][0] == "failed" and "network down" in rows["api_sync"][1]
    assert rows["hub_read"][0] == "ok"
    state = json.loads(conn.execute("SELECT value FROM kv_config WHERE key='robot_state'").fetchone()[0])
    # api_sync's failure showed up at once (not at the next heartbeat); it reads "attention" not "error" because
    # hub_read - the real data source - succeeded in the same batch.
    assert state["state"] == "attention" and "network down" in state["message"]


def test_read_state_heartbeat_silent_and_never(tmp_path):
    db = str(tmp_path / "t.db")
    sqlite3.connect(db).close()
    assert robot.read_state(db)["state"] == "never"

    robot.publish_state(CFG, db, started_at=datetime.now().isoformat(timespec="seconds"))
    fresh = robot.read_state(db)
    assert fresh["state"] == "healthy" and fresh["name"] == "Flipkart Robo"
    later = datetime.now() + timedelta(minutes=robot.SILENT_AFTER_MINUTES + 1)
    silent = robot.read_state(db, now=later)
    assert silent["state"] == "silent" and "not running" in silent["message"]


def test_manual_scripts_do_not_fake_a_heartbeat(tmp_path):
    db = str(tmp_path / "t.db")
    robot.record_run(db, "hub_read", datetime.now(), "ok", "manual")
    robot.publish_state(CFG, db, touch_beat=False)                  # what a hand-run script does
    assert robot.read_state(db)["state"] == "silent"                # no robot process ever beat -> still not alive
    robot.publish_state(CFG, db)                                    # the real process
    assert robot.read_state(db)["state"] in ("healthy", "attention")


def test_old_runs_are_pruned(tmp_path):
    db = str(tmp_path / "t.db")
    conn = robot._connect(db)
    old = (datetime.now() - timedelta(days=robot.KEEP_RUN_DAYS + 1)).isoformat(timespec="seconds")
    conn.execute("INSERT INTO robot_runs(job,started_at,finished_at,duration_s,status,detail) VALUES ('digest',?,?,1,'ok','')", (old, old))
    conn.commit(); conn.close()
    robot.record_run(db, "digest", datetime.now(), "ok")
    assert sqlite3.connect(db).execute("SELECT COUNT(*) FROM robot_runs").fetchone()[0] == 1
