"""Seller Hub session keeper: browser lock and the keeper's decision logic (no browser needed)."""
from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timedelta

import pytest

from fkpulse import robot
from fkpulse.hublock import HubBusy, hub_lock
from fkpulse.hubkeeper import HEARTBEAT_RUN_EVERY_MIN, KEEP_EVERY_S, KeeperLogic, lifetime_text

T0 = datetime(2026, 9, 25, 18, 0, 0)


def test_hub_lock_excludes_a_second_holder(tmp_path):
    path = tmp_path / "hub.lock"
    with hub_lock(path=path):
        with pytest.raises(HubBusy):
            with hub_lock(wait_s=0, path=path):
                pass
    with hub_lock(path=path):       # released -> free again
        pass


def test_hub_lock_waits_for_the_holder(tmp_path):
    path = tmp_path / "hub.lock"
    order = []

    def holder():
        with hub_lock(path=path):
            order.append("held")
            threading.Event().wait(1.0)
        order.append("released")

    t = threading.Thread(target=holder)
    t.start()
    while "held" not in order:
        threading.Event().wait(0.05)
    with hub_lock(wait_s=5, path=path):
        order.append("waiter")
    t.join()
    assert order == ["held", "released", "waiter"]


def test_a_fresh_sign_in_is_read_at_once_then_on_schedule():
    k = KeeperLogic(read_minutes=180)
    assert k.observe(False, T0)["event"] == "still_out" and k.sleep_seconds() < KEEP_EVERY_S   # watches, never reloads
    ev = k.observe(True, T0 + timedelta(seconds=10))
    assert ev["event"] == "started" and ev["read_now"] and ev["record_ok"]
    assert k.sleep_seconds() == KEEP_EVERY_S                                                    # now it touches the page every 45 s
    k.read_done(T0 + timedelta(minutes=2))
    # an hour later: still signed in, no read due yet
    ev = k.observe(True, T0 + timedelta(minutes=60))
    assert ev["event"] == "continues" and not ev["read_now"]
    # three hours after the last read: a scheduled read
    assert k.observe(True, T0 + timedelta(minutes=2 + 181))["read_now"]


def test_it_logs_a_line_every_ten_minutes_not_every_visit():
    k = KeeperLogic(read_minutes=180)
    k.observe(True, T0)
    k.read_done(T0)
    logged = 0
    for i in range(1, 61):      # an hour of visits, one every minute
        if k.observe(True, T0 + timedelta(minutes=i))["record_ok"]:
            logged += 1
    assert logged == 60 // HEARTBEAT_RUN_EVERY_MIN


def test_the_end_of_a_login_reports_how_long_it_lasted():
    k = KeeperLogic(read_minutes=180)
    k.observe(True, T0)
    k.observe(True, T0 + timedelta(hours=2))
    ev = k.observe(False, T0 + timedelta(hours=5, minutes=30))
    assert ev["event"] == "ended" and round(ev["lifetime_minutes"]) == 330
    assert "after 5.5 hours" in lifetime_text(ev["lifetime_minutes"])
    assert "after 25 minutes" in lifetime_text(25)
    assert k.observe(False, T0 + timedelta(hours=6))["event"] == "still_out"   # afterwards: waiting for you, no repeat "ended"
    assert k.observe(True, T0 + timedelta(hours=7))["event"] == "started"      # signing in again starts a new session and a read


def test_ok_keeper_lines_are_pruned_after_a_day_but_problems_are_kept(tmp_path):
    db = str(tmp_path / "t.db")
    robot._connect(db).close()
    old = (datetime.now() - timedelta(days=2)).isoformat(timespec="seconds")
    conn = sqlite3.connect(db)
    for status in ("ok", "skipped", "needs_you"):
        conn.execute("INSERT INTO robot_runs(job, started_at, finished_at, duration_s, status, detail) VALUES ('hub_keepalive', ?, ?, 1, ?, '')", (old, old, status))
    conn.commit(); conn.close()
    robot.record_run(db, "hub_keepalive", datetime.now(), "ok", "fresh")
    left = sorted(r[0] for r in sqlite3.connect(db).execute("SELECT status FROM robot_runs WHERE job = 'hub_keepalive'"))
    assert left == ["needs_you", "ok"]          # the 2-day-old ok/skipped are gone, the old problem and today's line remain


def test_rank_scan_never_holds_the_database_locked_while_it_waits(tmp_path, monkeypatch):
    """A 20-minute scan used to keep ONE transaction open, so the heartbeat / run log could not write and the dashboard
    said the robot was not running. Each keyword's rows must be committed and the database writable in between."""
    from fkpulse import scheduler
    db = str(tmp_path / "t.db")
    conn = sqlite3.connect(db)
    conn.executescript("""CREATE TABLE tracked_keywords(fsn TEXT, keyword TEXT, active INTEGER);
        CREATE TABLE rank_history(id INTEGER PRIMARY KEY AUTOINCREMENT, fsn TEXT, keyword TEXT, position INTEGER, page INTEGER, serp_median_price REAL, fetched_at TEXT);
        INSERT INTO tracked_keywords VALUES ('F1','kw one',1),('F2','kw two',1),('F3','kw three',1);""")
    conn.commit(); conn.close()
    writable_between = []

    class FakeHarvester:
        def __init__(self, config): pass
        def scan_keyword(self, keyword, fsns):
            # while the scan is "waiting on the network", another writer (the robot heartbeat) must be able to write
            other = sqlite3.connect(db, timeout=0.5)
            try:
                other.execute("CREATE TABLE IF NOT EXISTS probe(x)")
                other.execute("INSERT INTO probe VALUES (1)")
                other.commit()
                writable_between.append(True)
            except sqlite3.OperationalError:
                writable_between.append(False)
            finally:
                other.close()
            return [{"fsn": next(iter(fsns)), "position": 3, "page": 1, "serp_median_price": 100.0}]

    import fkpulse.harvester as harvester
    monkeypatch.setattr(harvester, "RankHarvester", FakeHarvester)
    status, detail = scheduler.job_rank_scan({"harvester": {"max_keywords_per_run": 10}}, db)
    assert status == "ok" and "3 rank readings" in detail
    assert writable_between == [True, True, True]
    assert sqlite3.connect(db).execute("SELECT COUNT(*) FROM rank_history").fetchone()[0] == 3
