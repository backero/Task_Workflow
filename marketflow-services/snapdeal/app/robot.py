"""SD Robo: what the background scheduler did, and how each job ended.

Same vocabulary as the Amazon, Flipkart and Meesho robots (each is a separate system):
  job outcomes  ok | partial | skipped | needs_you | failed
  robot state   healthy | attention | needs_you | error | demo

`scheduler.py`'s jobs used to swallow failures into `sync_log` only (a log nobody watches by default); every run is
now also written to `robot_runs` with a plain result, and `/api/robot` turns that into one state for the dashboard.
"""
from datetime import datetime, timedelta

from . import database as db

JOBS = {
    "sync": ("Panel sync", "Pulls listings, the scorecard, daily metrics and ads spend from the active connector."),
    "panel_read": ("Seller Panel read", "Reads the dashboard totals, the full catalog, pending orders and courier returns inside the browser window that stays signed in (snapdeal_keeper)."),
    "rank": ("Keyword rank scan", "Looks up each tracked keyword on Snapdeal's public search pages and records your position."),
    "ai_analysis": ("AI strategic analysis", "Asks Claude for prioritized suggestions grounded in the real numbers above and Snapdeal's own algorithm research doc. Needs ANTHROPIC_API_KEY set to run; skipped otherwise."),
}


def _every_minutes(job):
    import os
    if job == "sync":
        return int(os.environ.get("SD_POLL_FAST", "240"))
    if job == "panel_read":
        return int(os.environ.get("SD_POLL_FAST", "240"))
    if job == "ai_analysis":
        return int(os.environ.get("SD_POLL_FAST", "240"))
    return int(os.environ.get("SD_POLL_SLOW", "360"))


def now_iso():
    return db.now()


def derive_state(connector, is_demo, latest, started_at, now=None):
    """Robot state + message. Pure: `latest` maps job -> {"status","detail","finished_at"} (missing = never run)."""
    now = now or datetime.now()
    if is_demo:
        return "demo", "Demo mode: the numbers are sample data. Set SD_CONNECTOR in .env to connect a real source."
    sync = latest.get("sync")
    if sync and sync["status"] == "needs_you":
        return "needs_you", sync["detail"] or "The Snapdeal login has ended — run `python -m app.connectors.login` again."
    if sync and sync["status"] == "failed":
        return "error", "Panel sync failed: " + (sync["detail"] or "see the sync log")
    if sync is None:
        try:
            waited = (now - datetime.fromisoformat(started_at)).total_seconds() / 60 if started_at else 0
        except ValueError:
            waited = 0
        every = _every_minutes("sync")
        if waited > every * 2.5 + 10:
            return "error", "The panel sync has not run since the app started."
        return "attention", "Started; the first sync has not run yet."
    try:
        age = (now - datetime.fromisoformat(sync["finished_at"])).total_seconds() / 60
    except ValueError:
        age = 0
    every = _every_minutes("sync")
    if age > every * 2.5 + 10:
        return "error", f"The panel sync has not run for {age / 60:.1f} hours (expected every {every} min)."
    if sync["status"] == "partial":
        return "attention", sync["detail"] or "The last sync read only part of the panel."
    return "healthy", "Syncing on schedule."


def read(connector_name, is_demo):
    latest = {}
    for row in db.q("SELECT job, status, detail, finished_at FROM robot_runs WHERE id IN "
                    "(SELECT MAX(id) FROM robot_runs GROUP BY job)"):
        latest[row["job"]] = row
    started_at = db.get_setting("robot_started_at")
    state, message = derive_state(connector_name, is_demo, latest, started_at)
    jobs = []
    for job, (label, what) in JOBS.items():
        run = latest.get(job)
        jobs.append({"id": job, "label": label, "what": what, "every_minutes": _every_minutes(job),
                     "last_run": run["finished_at"] if run else None, "last_status": run["status"] if run else None,
                     "detail": run["detail"] if run else None})
    runs = db.q("SELECT finished_at, job, status, detail FROM robot_runs ORDER BY id DESC LIMIT 30")
    return {"id": "snapdeal", "name": "SD Robo", "platform": "Snapdeal", "connector": connector_name,
            "state": state, "message": message, "beat": db.get_setting("robot_beat"),
            "started_at": started_at, "jobs": jobs, "runs": runs}
