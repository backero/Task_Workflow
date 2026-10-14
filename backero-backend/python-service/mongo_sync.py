"""
Shared MongoDB writer for the 3 marketplace-automation scraper services
(Meesho, Snapdeal, Flipkart) living under backero-backend/python-service/.

Each service's own scraper/scheduler logic is untouched -- this module is
called from each platform's run_scheduler.py as an additional periodic job
that takes the platform's own, already-correct KPI/overview computation
(the same function its old Flask/FastAPI /overview route used to call) and
upserts it into the `marketflowsnapshots` collection -- the same database
backero-backend's Node code reads from (src/models/MarketflowSnapshot.js).

Nothing calls these services' HTTP APIs anymore; Mongo is the handoff point.
"""
import os
from datetime import datetime, timezone

from dotenv import load_dotenv

# backero-backend/.env -- one source of truth for MONGODB_URI, not duplicated
# per-platform.
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

_client = None
_collection = None


def _get_collection():
    global _client, _collection
    if _collection is not None:
        return _collection
    import pymongo

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI not set (expected in backero-backend/.env)")
    _client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=10000)
    db = _client.get_default_database()
    _collection = db["marketflowsnapshots"]
    _collection.create_index([("platform", 1), ("endpoint", 1)], unique=True)
    return _collection


def upsert_overview(platform: str, data: dict) -> None:
    """Upsert the latest 'overview' snapshot for a platform. Matches the
    shape backero-backend's marketflow.routes.js previously proxied live
    from each service's /api/overview (or /v1/dashboard/unified for amazon)."""
    try:
        col = _get_collection()
        col.update_one(
            {"platform": platform, "endpoint": "overview"},
            {"$set": {
                "data": data,
                "syncedAt": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
        print(f"[mongo_sync] {platform}: overview synced", flush=True)
    except Exception as exc:  # never let a Mongo hiccup kill the scraper process
        print(f"[mongo_sync] {platform}: sync failed - {type(exc).__name__}: {exc}", flush=True)
