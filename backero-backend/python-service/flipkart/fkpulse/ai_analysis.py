"""AI strategic analysis - reads the real numbers job_digest just refreshed and asks TypeSafe's Jev model (docs.typesafe.ai) a fixed
set of sales-manager yes/no/score/choice questions grounded in how Flipkart's own ranking actually works
(docs/flipkart_marketplace_deep_dive.md) - pricing risk, quality risk, fulfilment risk, urgency, priority area.
Not a narrative summary: Jev AI answers typed questions with probabilities/confidence, it doesn't write prose, so
this asks it to predict what's right/wrong rather than explain it (see python-service/jev_client.py).

Same shape as Meesho's fkpulse/../ai_analysis.py, Snapdeal's app/ai_analysis.py and Amazon's
server/src/ai/analyze.ts: silently no-ops until TYPESAFE_API_KEY is set, runs after every real data refresh
(called from scheduler.py's job_digest, which itself runs after every real Seller Hub read via finish_hub_read).
recommend.py's fixed-threshold rules stay the source of truth for "is this a violation"; this layer adds the
predictive judgment a fixed rule can't make.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
import jev_client  # noqa: E402

MODEL = jev_client.MODEL

SCHEMA = """
CREATE TABLE IF NOT EXISTS ai_insights(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, summary TEXT NOT NULL, model TEXT, based_on TEXT);
"""


def _is_configured() -> bool:
    return jev_client.is_configured()


def build_context(conn: sqlite3.Connection) -> dict:
    """Real current data only - the same tables the dashboard itself reads from."""
    conn.row_factory = sqlite3.Row

    listings = [dict(r) for r in conn.execute(
        "SELECT fsn, sku, title, price, mrp, stock, rating_avg, rating_count, status FROM listings ORDER BY rating_count DESC")]

    hub_listing_rows = [dict(r) for r in conn.execute(
        "SELECT sku, title, price, mrp, stock, days_on_hand, return_rate_pct, quality, rating FROM hub_listing_rows "
        "WHERE captured_at = (SELECT MAX(captured_at) FROM hub_listing_rows)")]

    account_metrics: dict = {}
    for row in conn.execute("SELECT area, key, value, text FROM hub_metrics WHERE id IN "
                            "(SELECT MAX(id) FROM hub_metrics GROUP BY area, key)"):
        account_metrics.setdefault(row["area"], {})[row["key"]] = row["value"] if row["value"] is not None else row["text"]

    traffic_drops = [dict(r) for r in conn.execute(
        "SELECT sku, name, impressions_drop, units_lost FROM hub_traffic_drops "
        "WHERE captured_at = (SELECT MAX(captured_at) FROM hub_traffic_drops)")]

    open_recs = [dict(r) for r in conn.execute(
        "SELECT fsn, rule_id, severity, title, detail FROM recommendations WHERE status='open' ORDER BY id DESC LIMIT 30")]

    return {"listings": listings, "hub_listing_snapshot": hub_listing_rows, "account_metrics": account_metrics,
            "traffic_drops": traffic_drops, "open_findings": open_recs}


def analyze_and_store(db_path: str) -> str:
    """Runs after every real digest (which itself runs after every real Seller Hub read). Never raises."""
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA)
        if not _is_configured():
            return "skipped: TYPESAFE_API_KEY not set"

        context = build_context(conn)
        if not context["listings"] and not context["account_metrics"]:
            return "skipped: no real data yet"

        try:
            predictions = jev_client.ask(context)
            summary = json.dumps(predictions)
        except Exception as exc:  # noqa: BLE001 - must never break the digest job
            return f"failed: {type(exc).__name__}: {exc}"

        now = datetime.now().isoformat(timespec="seconds")
        conn.execute("INSERT INTO ai_insights(ts, summary, model, based_on) VALUES (?,?,?,?)",
                     (now, summary, MODEL, json.dumps({"listings": len(context["listings"]),
                                                        "open_findings": len(context["open_findings"])})))
        conn.commit()
        return "ok"
    finally:
        conn.close()
