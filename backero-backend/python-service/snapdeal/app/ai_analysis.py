"""AI strategic analysis - reads the real numbers the keeper just collected and asks TypeSafe's Jev model (docs.typesafe.ai) a fixed
set of sales-manager yes/no/score/choice questions grounded in how Snapdeal's own algorithm actually works
(Snapdeal_Marketplace_Algorithm_Report.md) - pricing risk, quality risk, fulfilment risk, urgency, priority area.
Not a narrative summary: Jev AI answers typed questions with probabilities/confidence, it doesn't write prose, so
this asks it to predict what's right/wrong rather than explain it (see python-service/jev_client.py).

Same shape as Meesho's app/ai_analysis.py and Amazon's server/src/ai/analyze.ts: silently no-ops until
TYPESAFE_API_KEY is set, runs after every real data refresh. The rule engine (app/engine/rules.py) stays the
source of truth for "is this a violation"; this layer adds the predictive judgment a fixed threshold can't make.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime

from . import database as db

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
import jev_client  # noqa: E402

MODEL = jev_client.MODEL

SCHEMA = """
CREATE TABLE IF NOT EXISTS ai_insights(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, summary TEXT NOT NULL, model TEXT, based_on TEXT);
"""


def _is_configured() -> bool:
    return jev_client.is_configured()


def build_context() -> dict:
    """Real current data only - the same tables the dashboard itself reads from."""
    from .connectors import panel_reader

    with db.conn() as c:
        c.executescript(panel_reader.SCHEMA)

    latest_area: dict = {}
    for row in db.q("SELECT area, key, value, text FROM panel_metrics WHERE id IN "
                    "(SELECT MAX(id) FROM panel_metrics GROUP BY area, key)"):
        latest_area.setdefault(row["area"], {})[row["key"]] = row["value"] if row["value"] is not None else row["text"]

    listings = db.q("""
        SELECT l.sku, l.title, l.status, l.price, l.mrp, l.stock, p.product_rating_pct, s.orders_30d,
               s.transfer_amount_30d, s.bad_pct
        FROM listings l LEFT JOIN listing_panel p ON p.sku = l.sku LEFT JOIN sku_performance s ON s.sku = l.sku
        ORDER BY l.status, s.orders_30d DESC""")

    settlements = db.q("SELECT date, amount, transactions FROM settlements ORDER BY date DESC LIMIT 5")
    ads = db.q("SELECT campaign, day, spend, impressions, clicks, orders, revenue FROM ads_daily ORDER BY day DESC LIMIT 5")
    open_alerts = db.q("SELECT severity, title, reason FROM alerts WHERE status='open' ORDER BY id DESC LIMIT 30")

    return {"account_metrics": latest_area, "listings": listings, "recent_settlements": settlements,
            "recent_ads": ads, "open_alerts": open_alerts}


def analyze_and_store() -> str:
    """Runs after every real sync. Returns a one-line status for the caller to log (never raises)."""
    with db.conn() as c:
        c.executescript(SCHEMA)

    if not _is_configured():
        return "skipped: TYPESAFE_API_KEY not set"

    context = build_context()
    if not context["listings"] and not context["account_metrics"]:
        return "skipped: no real data yet"

    try:
        predictions = jev_client.ask(context)
        summary = json.dumps(predictions)
    except Exception as exc:  # noqa: BLE001 - must never break the sync
        return f"failed: {type(exc).__name__}: {exc}"

    now = datetime.now().isoformat(timespec="seconds")
    with db.conn() as c:
        c.execute("INSERT INTO ai_insights(ts, summary, model, based_on) VALUES (?,?,?,?)",
                  (now, summary, MODEL, json.dumps({"listings": len(context["listings"]),
                                                     "open_alerts": len(context["open_alerts"])})))
    return "ok"
