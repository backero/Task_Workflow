"""Standalone watchdog: independently keeps MongoDB's snapdeal snapshot in sync with
the real SQLite data, on its own short interval. Exists because run_scheduler.py's
own internal mongo_sched job has been observed to intermittently push stale/zeroed
data even when the underlying SQLite data is correct (unresolved race condition
between the keeper thread and the scheduled sync) - this script is a reliable
backstop, not a replacement for fixing that root cause later.

Usage: python watchdog_sync.py [interval_seconds]
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from app.engine import metrics  # noqa: E402
from app import database as db  # noqa: E402
from mongo_sync import upsert_overview  # noqa: E402

INTERVAL_S = int(sys.argv[1]) if len(sys.argv) > 1 else 60


def sync_once():
    data = metrics.overview()
    try:
        rows = db.q("SELECT ts, summary, model FROM ai_insights ORDER BY id DESC LIMIT 1")
        data["ai_insight"] = rows[0] if rows else None
    except Exception:
        data["ai_insight"] = None
    try:
        data["alerts"] = db.q(
            "SELECT id, ts, severity, module, entity, code, title, reason, fix "
            "FROM alerts WHERE status='open' ORDER BY ts DESC LIMIT 20"
        )
    except Exception:
        data["alerts"] = []
    upsert_overview("snapdeal", data)
    panel = data.get("panel") or {}
    print(f"[watchdog] listings={data.get('listings')} sales_completed={panel.get('sales_completed')} orders_processed={panel.get('orders_processed')}", flush=True)


def main():
    print(f"[watchdog] snapdeal sync every {INTERVAL_S}s", flush=True)
    while True:
        try:
            sync_once()
        except Exception as exc:
            print(f"[watchdog] sync failed: {exc}", flush=True)
        time.sleep(INTERVAL_S)


if __name__ == "__main__":
    main()
