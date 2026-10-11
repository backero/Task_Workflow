"""CLI entry point for manual CSV/XLSX report imports, called by backero-backend's
upload route (src/routes/marketflow.routes.js) via subprocess. Wraps
app.connector.report_importer.import_report() -- auto-detects catalog-performance
vs orders reports from column headers -- then immediately recomputes KPIs/alerts
and syncs the fresh numbers to MongoDB, so an upload shows up in the UI right away
instead of waiting for the next scheduled cycle.

Usage: python import_csv.py <path-to-csv-or-xlsx>
Prints a single JSON line to stdout: {ok, rows, kind, detail}.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from app.config import load_config, DATA_DIR  # noqa: E402
from app.database import get_conn  # noqa: E402
from app.connector.report_importer import import_report  # noqa: E402
from app.scheduler import recompute_now  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "rows": 0, "kind": "unknown", "detail": "usage: import_csv.py <filepath>"}))
        return 1
    filepath = sys.argv[1]

    load_config(force=True)
    db_path = os.path.join(DATA_DIR, "saas.db")
    conn = get_conn(db_path)
    try:
        result = import_report(conn, filepath)
    finally:
        conn.close()

    if result.get("ok"):
        recompute_now(db_path)
        try:
            from mongo_sync import upsert_overview
            from app.database import kpis, alerts as db_alerts

            conn = get_conn(db_path)
            try:
                k = dict(kpis(conn) or {})
                top_issues = [dict(r) for r in db_alerts(conn, limit=5)]
                try:
                    ai_row = conn.execute(
                        "SELECT ts, summary, model FROM ai_insights ORDER BY id DESC LIMIT 1"
                    ).fetchone()
                    ai_insight = dict(ai_row) if ai_row else None
                except Exception:
                    ai_insight = None
            finally:
                conn.close()
            upsert_overview("meesho", {"kpis": k, "top_issues": top_issues, "ai_insight": ai_insight})
        except Exception as exc:  # noqa: BLE001 - the import itself already succeeded; sync is best-effort
            result["mongo_sync_error"] = f"{type(exc).__name__}: {exc}"

    print(json.dumps(result))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
