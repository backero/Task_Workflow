"""
Standalone scheduler-only entrypoint for Meesho's scraper/recompute jobs --
no Flask web server. Nothing calls this service's HTTP API anymore;
mongo_sync.py pushes the same KPI data this service used to serve over HTTP
into MongoDB instead, which is what backero-backend's Node code now reads.

app/scheduler.py's start_scheduler(app) only ever touches app.config and
app.app_context() -- both trivially shimmed here, so the real scheduler
code (jobs, intervals, the AI/recommendation pipeline) is untouched.

Usage: python run_scheduler.py
"""
import os
import sys
import time
from contextlib import nullcontext

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from app.config import load_config, get, DATA_DIR  # noqa: E402
from app.database import get_conn, init_db, kpis, alerts as db_alerts  # noqa: E402
from app import scheduler as sched_mod  # noqa: E402

DB_PATH = os.path.join(DATA_DIR, "saas.db")


class _AppShim:
    """Stand-in for the Flask `app` object scheduler.py expects."""

    def __init__(self, db_path):
        self.config = {"database_path": db_path}

    def app_context(self):
        return nullcontext()


def sync_to_mongo():
    from mongo_sync import upsert_overview

    conn = get_conn(DB_PATH)
    try:
        k = dict(kpis(conn) or {})
        top_issues = [dict(r) for r in db_alerts(conn, limit=5)]
        try:
            ai_row = conn.execute(
                "SELECT ts, summary, model FROM ai_insights ORDER BY id DESC LIMIT 1"
            ).fetchone()
            ai_insight = dict(ai_row) if ai_row else None
        except Exception:
            ai_insight = None  # table not created yet (first run, before the first recompute cycle)
    finally:
        conn.close()
    upsert_overview("meesho", {"kpis": k, "top_issues": top_issues, "ai_insight": ai_insight})


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, "uploads"), exist_ok=True)
    load_config(force=True)

    conn = get_conn(DB_PATH)
    try:
        init_db(conn)
        empty = conn.execute("SELECT COUNT(*) AS c FROM listings").fetchone()["c"] == 0
    finally:
        conn.close()
    if get("mode", "demo") == "demo" and empty:
        try:
            from app.demo_data import seed_demo
            seed_demo(DB_PATH)
        except Exception as exc:
            print(f"[meesho] demo seed failed: {exc}", flush=True)

    app = _AppShim(DB_PATH)
    sched_mod.start_scheduler(app)

    sync_to_mongo()
    from apscheduler.schedulers.background import BackgroundScheduler
    mongo_sched = BackgroundScheduler(daemon=True)
    mongo_sched.add_job(sync_to_mongo, "interval", minutes=3, id="mongo_sync", max_instances=1, coalesce=True)
    mongo_sched.start()

    print("[meesho] scheduler + mongo sync running", flush=True)
    try:
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        print("[meesho] stopping", flush=True)


if __name__ == "__main__":
    main()
