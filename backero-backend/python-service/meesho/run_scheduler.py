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


def _latest_panel_area(conn, area):
    """Latest key/value pairs captured for one panel_metrics area (e.g. 'payments', 'returns',
    'dispatch') -- the real account-level figures a seller sees on their own Meesho dashboard."""
    rows = conn.execute(
        "SELECT key, value, text FROM panel_metrics WHERE area=? AND "
        "captured_at=(SELECT MAX(captured_at) FROM panel_metrics WHERE area=?)",
        (area, area),
    ).fetchall()
    return {r["key"]: (r["value"] if r["value"] is not None else r["text"]) for r in rows}


def sync_to_mongo():
    from mongo_sync import upsert_overview

    conn = get_conn(DB_PATH)
    try:
        k = dict(kpis(conn) or {})
        top_issues = [dict(r) for r in db_alerts(conn, limit=5)]
        account_metrics = {
            "payments": _latest_panel_area(conn, "payments"),
            "returns": _latest_panel_area(conn, "returns"),
            "dispatch": _latest_panel_area(conn, "dispatch"),
            "orders": _latest_panel_area(conn, "orders"),
            # Home page's today-counters (daily_orders/daily_views/pending_orders/etc) -- already
            # scraped every cycle but never synced until now, so it just sat in panel_metrics unused.
            "home": _latest_panel_area(conn, "home"),
        }
        try:
            ai_row = conn.execute(
                "SELECT ts, summary, model FROM ai_insights ORDER BY id DESC LIMIT 1"
            ).fetchone()
            ai_insight = dict(ai_row) if ai_row else None
        except Exception:
            ai_insight = None  # table not created yet (first run, before the first recompute cycle)
    finally:
        conn.close()
    upsert_overview("meesho", {"kpis": k, "top_issues": top_issues, "ai_insight": ai_insight, "account_metrics": account_metrics})


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
    # The recurring in-process mongo sync (previously every 3 min via its own
    # BackgroundScheduler job here) has been observed to intermittently push zeroed
    # KPIs into Mongo even when the underlying SQLite data is correct -- an
    # unresolved race with the keeper thread's own SQLite access from the same
    # process. watchdog_sync.py now owns the recurring sync instead, as a fully
    # separate process reading the same (always-correct-when-read-fresh) data.
    # Run it alongside this one: `python watchdog_sync.py`.

    print("[meesho] scheduler running (run watchdog_sync.py separately for mongo sync)", flush=True)
    try:
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        print("[meesho] stopping", flush=True)


if __name__ == "__main__":
    main()
