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

from app import scheduler as sched_mod  # noqa: E402
from app.engine import metrics  # noqa: E402


def sync_to_mongo():
    from mongo_sync import upsert_overview
    upsert_overview("snapdeal", metrics.overview())


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
