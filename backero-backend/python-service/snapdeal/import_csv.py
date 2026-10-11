"""CLI entry point for manual CSV report imports, called by backero-backend's
upload route (src/routes/marketflow.routes.js) via subprocess.

Unlike Meesho's importer (which auto-detects report kind from column headers),
Snapdeal's CsvConnector (app/connectors/csv_ingest.py) picks files by FILENAME
PREFIX under data/uploads/ -- listings*.csv, orders*.csv, scorecard*.csv,
ads*.csv -- so the Node upload route already saved the file there with the
right prefix before calling this script. This just runs sync_now() (which
reads whatever CsvConnector finds) and syncs the result to MongoDB, so an
upload shows up in the UI immediately instead of waiting for the next
scheduled cycle. Requires SD_CONNECTOR=csv in .env (not checked here -- if
it's still "browser"/"demo"/"api", sync_now() will just use that instead).

Usage: python import_csv.py
Prints a single JSON line to stdout: the sync_now() status dict.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from app.scheduler import sync_now  # noqa: E402


def main() -> int:
    status = sync_now()  # {connector, demo, parts: {listings, metrics, scorecard, ads}, new_alerts}

    try:
        from mongo_sync import upsert_overview
        from app.engine import metrics
        from app import database as db

        data = metrics.overview()
        try:
            rows = db.q("SELECT ts, summary, model FROM ai_insights ORDER BY id DESC LIMIT 1")
            data["ai_insight"] = rows[0] if rows else None
        except Exception:
            data["ai_insight"] = None
        upsert_overview("snapdeal", data)
    except Exception as exc:  # noqa: BLE001 - the sync itself already ran; mongo sync is best-effort
        status["mongo_sync_error"] = f"{type(exc).__name__}: {exc}"

    print(json.dumps(status, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
