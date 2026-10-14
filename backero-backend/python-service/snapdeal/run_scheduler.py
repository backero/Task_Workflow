"""
Standalone scheduler-only entrypoint for Snapdeal's scraper/sync jobs -- no
FastAPI web server. app.scheduler.start() has no app-object dependency at
all, so this is a thin wrapper: start the existing scheduler, then also run
a periodic Mongo sync using the same metrics.overview() function the old
/api/overview route called. Nothing calls this service's HTTP API anymore.

Usage: python run_scheduler.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# Loads SD_CONNECTOR etc. from this platform's own .env — previously never loaded at all,
# so SD_CONNECTOR=browser already saved there was silently ignored and get_connector()
# fell back to its "demo" default regardless of what the file said.
from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from app import scheduler as sched_mod  # noqa: E402
from app import database as db  # noqa: E402
from app.engine import metrics  # noqa: E402


def sync_to_mongo():
    from mongo_sync import upsert_overview
    data = metrics.overview()
    try:
        rows = db.q("SELECT ts, summary, model FROM ai_insights ORDER BY id DESC LIMIT 1")
        data["ai_insight"] = rows[0] if rows else None
    except Exception:
        data["ai_insight"] = None  # table not created yet (first run)
    upsert_overview("snapdeal", data)


def main():
    sched_mod.start()

    sync_to_mongo()
    from apscheduler.schedulers.background import BackgroundScheduler
    mongo_sched = BackgroundScheduler(daemon=True)
    mongo_sched.add_job(sync_to_mongo, "interval", minutes=3, id="mongo_sync", max_instances=1, coalesce=True)
    mongo_sched.start()

    print("[snapdeal] scheduler + mongo sync running", flush=True)
    try:
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        print("[snapdeal] stopping", flush=True)


if __name__ == "__main__":
    main()
