"""Read-only export of captured Seller Hub data, with per-field capture dates."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

TABLES = {
    "listings": "hub_listing_rows",
    "campaigns": "hub_ads_campaigns",
    "pendingOrders": "hub_pending_order_groups",
    "trafficDrops": "hub_traffic_drops",
}


def build_mirror(db_path: str) -> dict:
    # mode=ro prevents accidentally creating an empty source database.
    conn = sqlite3.connect(Path(db_path).resolve().as_uri() + "?mode=ro", uri=True, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("BEGIN")  # all tables come from the same SQLite snapshot
        metrics: dict = {}
        for row in conn.execute(
            "SELECT area,key,value,text,captured_at FROM hub_metrics WHERE id IN "
            "(SELECT MAX(id) FROM hub_metrics GROUP BY area,key)"
        ):
            metrics.setdefault(row["area"], {})[row["key"]] = {
                "value": row["value"] if row["value"] is not None else row["text"],
                "capturedAt": row["captured_at"],
            }
        result = {"source": "seller_hub", "mode": "live", "metrics": metrics, "coverage": {}}
        for key, table in TABLES.items():
            captured = conn.execute(f"SELECT MAX(captured_at) FROM {table}").fetchone()[0]
            rows = [dict(row) for row in conn.execute(
                f"SELECT * FROM {table} WHERE captured_at = ? ORDER BY id", (captured,)
            )]
            for row in rows:
                row.pop("id", None)
            result[key] = rows
            result["coverage"][key] = {"capturedAt": captured, "count": len(rows)}
        result["lastScrapedAt"] = conn.execute("SELECT MAX(captured_at) FROM hub_metrics").fetchone()[0]
        status = {"sellerhub_error": None, "sellerhub_last_ok": None}
        for row in conn.execute(
            "SELECT key,value FROM kv_config WHERE key IN ('sellerhub_error','sellerhub_last_ok')"
        ):
            if row["key"] == "sellerhub_error":
                try:
                    status[row["key"]] = json.loads(row["value"])
                except (ValueError, TypeError):
                    status[row["key"]] = {"error": str(row["value"])}
            else:
                status[row["key"]] = row["value"]
        result["status"] = status
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for key in ('fullOrders', 'returnDetails'):
            capture = conn.execute('SELECT * FROM hub_history_captures WHERE kind=? ORDER BY id DESC LIMIT 1', (key,)).fetchone() if 'hub_history_captures' in tables else None
            result[key] = json.loads(capture['rows_json']) if capture else []
            if capture:
                for row in result[key]:
                    row['captured_at'] = capture['captured_at']
            result['coverage'][key] = {
                'capturedAt': capture['captured_at'] if capture else None,
                'count': len(result[key]), 'status': capture['status'] if capture else 'unavailable',
                'detail': capture['detail'] if capture else 'This detail source has not been captured yet.',
                'period': capture['period'] if capture else None,
                'total': capture['total'] if capture else None,
            }
            if any(marker in (result['coverage'][key]['detail'] or '') for marker in ('Vajram', 'Facet(')):
                result['coverage'][key]['detail'] = (
                    'Flipkart returned shipment identifiers but could not return complete order-item details. '
                    'Product, price and order-date fields remain unavailable where not returned.'
                )
        result["keywords"] = []
        result["limitations"] = [
            "The packing queue is separate from captured history. History coverage and missing order-item fields are reported explicitly.",
            "Captured returns currently cover the self-ship Return Request queue only, not all customer and courier returns.",
            "Listings are captured active-listing rows; inactive and blocked products are counts only.",
            "Organic CTR and seller search-term / keyword reports have not been captured.",
            "Ads CTR/CVR and Traffic Report conversion use different attribution and date ranges.",
            "Empty detail tables mean no rows were captured, not a confirmed zero in the seller account.",
            "Each section keeps its own capture date; refreshing this page does not re-scrape Seller Hub.",
        ]
        return result
    finally:
        conn.close()


def sync_mirror(db_path: str) -> bool:
    """Only publish into an explicitly bound organization; never infer account ownership."""
    import os
    import sys
    from datetime import datetime, timezone

    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from mongo_sync import _get_collection
    from bson import ObjectId

    org_id = os.environ.get("FLIPKART_ORGANIZATION_ID")
    if not org_id:
        return False
    if not ObjectId.is_valid(org_id):
        raise ValueError("Invalid FLIPKART_ORGANIZATION_ID")
    data = build_mirror(db_path)
    if not data["lastScrapedAt"]:
        return False
    collection = _get_collection().database["flipkartsellermirrors"]
    collection.create_index("organizationId", unique=True)
    collection.update_one(
        {"organizationId": ObjectId(org_id)},
        {"$set": {"data": data, "syncedAt": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return True
