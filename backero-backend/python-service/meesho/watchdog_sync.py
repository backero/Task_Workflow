"""Standalone watchdog: independently keeps MongoDB's meesho snapshot in sync with
the real SQLite data, on its own short interval. Exists because run_scheduler.py's
own internal mongo_sched job has been observed to intermittently push zeros even
when the underlying SQLite data is correct (unresolved race condition between the
keeper thread and the scheduled sync) - this script is a reliable backstop, not a
replacement for fixing that root cause later.

Usage: python watchdog_sync.py [interval_seconds]
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from app.config import load_config, DATA_DIR  # noqa: E402
from app.database import get_conn, kpis, alerts as db_alerts  # noqa: E402
from mongo_sync import upsert_overview  # noqa: E402

DB_PATH = os.path.join(DATA_DIR, "saas.db")
INTERVAL_S = int(sys.argv[1]) if len(sys.argv) > 1 else 60


def _latest_panel_area(conn, area):
    rows = conn.execute(
        "SELECT key, value, text FROM panel_metrics WHERE area=? AND "
        "captured_at=(SELECT MAX(captured_at) FROM panel_metrics WHERE area=?)",
        (area, area),
    ).fetchall()
    return {r["key"]: (r["value"] if r["value"] is not None else r["text"]) for r in rows}


def sync_once():
    conn = get_conn(DB_PATH)
    try:
        k = dict(kpis(conn) or {})
        top_issues = [dict(r) for r in db_alerts(conn, limit=5)]
        account_metrics = {
            "payments": _latest_panel_area(conn, "payments"),
            "returns": _latest_panel_area(conn, "returns"),
            "dispatch": _latest_panel_area(conn, "dispatch"),
            "orders": _latest_panel_area(conn, "orders"),
            "home": _latest_panel_area(conn, "home"),
        }
        try:
            ai_row = conn.execute(
                "SELECT ts, summary, model FROM ai_insights ORDER BY id DESC LIMIT 1"
            ).fetchone()
            ai_insight = dict(ai_row) if ai_row else None
        except Exception:
            ai_insight = None
    finally:
        conn.close()
    upsert_overview("meesho", {"kpis": k, "top_issues": top_issues, "ai_insight": ai_insight, "account_metrics": account_metrics})
    print(f"[watchdog] orders_7d={k.get('orders_7d')} impressions_7d={k.get('impressions_7d')} sales_7d={k.get('sales_7d')}", flush=True)


def main():
    load_config(force=True)
    print(f"[watchdog] meesho sync every {INTERVAL_S}s", flush=True)
    while True:
        try:
            sync_once()
        except Exception as exc:
            print(f"[watchdog] sync failed: {exc}", flush=True)
        time.sleep(INTERVAL_S)


if __name__ == "__main__":
    main()
