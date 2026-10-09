"""Flipkart Robo — the identity, run log and health of the background worker.

The scheduler (``run_scheduler.py``) IS the Flipkart Robo: one always-on process that runs four jobs. This module
makes it legible. Every job run is written to ``robot_runs`` (what ran, when, how it ended, in plain words), and once a
minute the robot publishes its own state to ``kv_config['robot_state']`` together with a heartbeat.

    Who decides what:
      * the robot decides its own state (healthy / attention / needs_you / error) — it knows why
      * a READER (the Streamlit dashboard) decides "silent": a dead process cannot say it is dead,
        so a heartbeat older than ``SILENT_AFTER_MINUTES`` means it stopped.

Job outcomes:  ok · partial (worked, but something was missed) · skipped (nothing to do) · needs_you (a human must act:
sign in, re-enter credentials) · failed (broke; the detail says why).

Pure logic where possible (``derive_state``, ``read_state``) so it is unit-tested without a scheduler or browser.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
from datetime import datetime, timedelta
from functools import wraps
from typing import Callable, Optional

log = logging.getLogger("fkpulse.robot")

ROBOT_ID = "flipkart"
ROBOT_NAME = "Flipkart Robo"

SILENT_AFTER_MINUTES = 5          # the heartbeat is written every minute
KEEP_RUN_DAYS = 30
OVERDUE_FACTOR = 2.5              # a job is overdue after this many of its normal intervals
OVERDUE_GRACE_MINUTES = 10

OUTCOMES = ("ok", "partial", "skipped", "needs_you", "failed")

SCHEMA = """
CREATE TABLE IF NOT EXISTS robot_runs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    duration_s REAL NOT NULL,
    status TEXT NOT NULL,
    detail TEXT
);
CREATE INDEX IF NOT EXISTS robot_runs_job_time ON robot_runs(job, finished_at);
"""

# job id -> (label, what it does). How often each runs comes from the config (see ``expected_minutes``).
JOBS: dict[str, tuple[str, str]] = {
    "api_sync": ("Flipkart API sync", "Pulls listings, orders, returns, settlements and stock through the Flipkart Seller API."),
    "hub_read": ("Seller Hub read", "Opens Seller Hub and reads Business Health, traffic, ads, payouts and listing quality."),
    "rank_scan": ("Search rank scan", "Looks up each tracked keyword on flipkart.com and records where our products rank."),
    "hub_keepalive": ("Seller Hub session keeper", "Visits Seller Hub every few minutes so Flipkart does not log you out for being idle."),
    "digest": ("Daily digest", "Recomputes KPIs and regenerates the recommendations from everything collected."),
    "ai_analysis": ("AI strategic analysis", "Asks Claude for prioritized suggestions grounded in the real numbers above and Flipkart's own marketplace research doc. Needs ANTHROPIC_API_KEY set to run; skipped otherwise."),
}


# ----------------------------------------------------------------------------- storage helpers
def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30)
    conn.executescript(SCHEMA)
    conn.execute("CREATE TABLE IF NOT EXISTS kv_config(key TEXT PRIMARY KEY, value TEXT)")
    return conn


def _kv_get(conn: sqlite3.Connection, key: str) -> Optional[str]:
    row = conn.execute("SELECT value FROM kv_config WHERE key = ?", (key,)).fetchone()
    return row[0] if row else None


def expected_minutes(job: str, config: dict) -> Optional[float]:
    """How often the job should run, or None when it is switched off."""
    polling = config.get("polling", {}) or {}
    if job == "api_sync":
        if not polling.get("api_enabled", True):
            return None
        return float(polling.get("api_minutes", 240))
    if job == "hub_read":
        hub = config.get("sellerhub", {}) or {}
        return float(hub.get("minutes", 240)) if hub.get("enabled", True) else None
    if job == "hub_keepalive":
        hub = config.get("sellerhub", {}) or {}
        return 10.0 if hub.get("enabled", True) and hub.get("keeper", True) else None   # the keeper logs a line every ~10 min
    if job == "rank_scan":
        if not (config.get("harvester", {}) or {}).get("enabled", False):
            return None
        return 24 * 60 / max(int(polling.get("rank_runs_per_day", 3)), 1)
    if job == "digest":
        return 24 * 60.0
    if job == "ai_analysis":
        return 24 * 60.0
    return None


# ----------------------------------------------------------------------------- recording runs
def record_run(db_path: str, job: str, started: datetime, status: str, detail: str = "") -> None:
    """Append one run. Never raises: reporting must not break the job that is being reported."""
    if status not in OUTCOMES:
        status = "failed"
    finished = datetime.now()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "INSERT INTO robot_runs(job, started_at, finished_at, duration_s, status, detail) VALUES (?,?,?,?,?,?)",
                (job, started.isoformat(timespec="seconds"), finished.isoformat(timespec="seconds"),
                 round((finished - started).total_seconds(), 1), status, (detail or "")[:500]))
            conn.execute("DELETE FROM robot_runs WHERE finished_at < ?", ((finished - timedelta(days=KEEP_RUN_DAYS)).isoformat(timespec="seconds"),))
            # a keeper ping every ~4 minutes would drown the list: keep a day of the successful ones, all of the others
            conn.execute("DELETE FROM robot_runs WHERE job = 'hub_keepalive' AND status IN ('ok', 'skipped') AND finished_at < ?",
                         ((finished - timedelta(days=1)).isoformat(timespec="seconds"),))
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        log.warning("robot_run_not_recorded job=%s error=%s", job, exc)


def tracked(job: str, fn: Callable) -> Callable:
    """Wrap a scheduler job so every run is logged.

    The job returns ``(status, detail)`` — or None, meaning ok. An exception is recorded as ``failed`` and swallowed
    (a broken job must never kill the scheduler). The robot's state is refreshed straight after, so a failure shows at
    once instead of at the next heartbeat.
    """
    @wraps(fn)
    def run(config: dict, db_path: str, *args, **kwargs):
        started = datetime.now()
        try:
            result = fn(config, db_path, *args, **kwargs)
            status, detail = result if isinstance(result, tuple) else ("ok", "")
        except Exception as exc:  # noqa: BLE001
            status, detail = "failed", f"{type(exc).__name__}: {exc}"
        record_run(db_path, job, started, status, detail)
        publish_state(config, db_path)
    return run


# ----------------------------------------------------------------------------- state
def _age_min(iso: Optional[str], now: datetime) -> Optional[float]:
    if not iso:
        return None
    try:
        return (now - datetime.fromisoformat(iso)).total_seconds() / 60
    except ValueError:
        return None


def derive_state(config: dict, latest: dict[str, dict], started_at: Optional[str], now: datetime) -> dict:
    """Robot state + per-job rows from the latest run of each job. Pure.

    ``latest`` maps job id -> {"status", "detail", "finished_at", "duration_s"} (missing = never ran).
    """
    jobs = []
    for job, (label, what) in JOBS.items():
        every = expected_minutes(job, config)
        run = latest.get(job)
        row = {"id": job, "label": label, "what": what, "every_minutes": every, "enabled": every is not None,
               "last_run": run["finished_at"] if run else None, "last_status": run["status"] if run else None,
               "detail": run["detail"] if run else None, "duration_s": run["duration_s"] if run else None, "overdue": False}
        if every is not None:
            since = _age_min(run["finished_at"], now) if run else _age_min(started_at, now)
            row["overdue"] = since is not None and since > every * OVERDUE_FACTOR + OVERDUE_GRACE_MINUTES
        jobs.append(row)

    active = [j for j in jobs if j["enabled"]]

    def worst(group: list) -> tuple[str, Optional[str]]:
        needs = [j for j in group if j["last_status"] == "needs_you"]
        failed = [j for j in group if j["last_status"] == "failed"]
        overdue = [j for j in group if j["overdue"] and j["last_status"] not in ("needs_you", "failed")]
        partial = [j for j in group if j["last_status"] == "partial"]
        if needs:
            return "needs_you", f"{needs[0]['label']}: {needs[0]['detail']}"
        if failed:
            return "error", f"{failed[0]['label']} failed: {failed[0]['detail']}"
        if overdue:
            j = overdue[0]
            return "error", f"{j['label']} has not run for a long time (expected every {int(j['every_minutes'])} minutes)."
        if partial:
            return "attention", f"{partial[0]['label']}: {partial[0]['detail']}"
        return "healthy", None

    # hub_read is the real data source the dashboard runs on; the other jobs (api_sync, rank_scan, digest) are
    # supplementary. A supplementary job stuck on something outside your control (Flipkart's own API approval, in
    # api_sync's case) still shows fully in its own row below, but must not turn the whole banner "needs you" or
    # "error" while Seller Hub itself is reading fine - that reads as "the site is broken" when it is not.
    primary = [j for j in active if j["id"] == "hub_read"]
    secondary = [j for j in active if j["id"] != "hub_read"]
    state, message = worst(primary)
    if state == "healthy":
        sec_state, sec_message = worst(secondary)
        state = "attention" if sec_state != "healthy" else "healthy"
        message = sec_message if sec_state != "healthy" else "All jobs are running on schedule."
    return {"state": state, "message": message, "jobs": jobs}


def latest_runs(conn: sqlite3.Connection) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for job, status, detail, finished, dur in conn.execute(
            "SELECT job, status, detail, finished_at, duration_s FROM robot_runs WHERE id IN (SELECT MAX(id) FROM robot_runs GROUP BY job)"):
        out[job] = {"status": status, "detail": detail or "", "finished_at": finished, "duration_s": dur}
    return out


def publish_state(config: dict, db_path: str, started_at: Optional[str] = None, touch_beat: bool = True) -> None:
    """Write the robot's own view of itself to kv_config['robot_state']. Never raises.

    ``touch_beat=False`` is for one-off scripts run by hand (they log a run and refresh the state, but they are NOT the
    robot process — letting them stamp a heartbeat would make a dead robot look alive).
    """
    try:
        conn = _connect(db_path)
        try:
            now = datetime.now()
            previous: dict = {}
            raw = _kv_get(conn, "robot_state")
            if raw:
                try:
                    previous = json.loads(raw)
                except ValueError:
                    previous = {}
            started_at = started_at or previous.get("started_at") or (now.isoformat(timespec="seconds") if touch_beat else None)
            view = derive_state(config, latest_runs(conn), started_at, now)
            view.update({"robot": ROBOT_ID, "name": ROBOT_NAME, "started_at": started_at,
                         "beat": now.isoformat(timespec="seconds") if touch_beat else previous.get("beat"),
                         "pid": os.getpid() if touch_beat else previous.get("pid")})
            conn.execute("INSERT OR REPLACE INTO kv_config(key, value) VALUES ('robot_state', ?)", (json.dumps(view),))
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        log.warning("robot_state_not_published error=%s", exc)


def beat(config: dict, db_path: str) -> None:
    """Heartbeat job: runs every minute so a dead process is noticed within ``SILENT_AFTER_MINUTES``."""
    publish_state(config, db_path)


def read_state(db_path: str, now: Optional[datetime] = None) -> dict:
    """What a reader (dashboard) should show: the published state, or ``silent`` / ``never`` when there is no live heartbeat."""
    now = now or datetime.now()
    base = {"robot": ROBOT_ID, "name": ROBOT_NAME, "jobs": [], "beat": None, "started_at": None}
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return {**base, "state": "never", "message": "The Flipkart database is not available."}
    try:
        raw = _kv_get(conn, "robot_state")
    except sqlite3.Error:
        raw = None
    finally:
        conn.close()
    if not raw:
        return {**base, "state": "never",
                "message": f"{ROBOT_NAME} has never reported in. Start it with `python run_scheduler.py` (or the 'FKPulse Scheduler' Windows task)."}
    view = json.loads(raw)
    age = _age_min(view.get("beat"), now)
    if age is None or age > SILENT_AFTER_MINUTES:
        return {**view, "state": "silent",
                "message": f"No heartbeat for {'a long time' if age is None else f'{int(age)} minutes'} — the {ROBOT_NAME} process is not running. "
                           "Start the 'FKPulse Scheduler' Windows task (or `python run_scheduler.py`)."}
    return view
