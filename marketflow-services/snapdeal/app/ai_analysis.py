"""AI strategic analysis - reads the real numbers the keeper just collected and asks Claude for prioritized,
specific suggestions grounded in how Snapdeal's own algorithm actually works (Snapdeal_Marketplace_Algorithm_Report.md).

Same shape as Meesho's app/ai_analysis.py and Amazon's server/src/ai/analyze.ts: silently no-ops until
ANTHROPIC_API_KEY is set, runs after every real data refresh. The rule engine (app/engine/rules.py) stays the
source of truth for "is this a violation"; this layer adds the "what would actually move the needle" judgment a
fixed threshold can't make.
"""
from __future__ import annotations

import json
import os
from datetime import datetime

from . import database as db

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

SYSTEM_PROMPT = """You are a Snapdeal marketplace strategist. Snapdeal is a value-commerce platform - over 95% of \
products sell below Rs.1000, the average order is under Rs.500, and buyers are price-sensitive, non-metro shoppers \
who sort by discount. Its visibility pipeline, in rough order of leverage:

1. Price and discount depth - the lowest credible price with a 40-60% MRP-to-selling-price discount band is the \
single biggest lever; a 15-20% price edge over an identical item elsewhere often decides the sale.
2. Seller-health gate - cancellation rate (keep under 1%), on-time dispatch (keep above 98%), customer rating \
(keep at or above 4.0 stars) and DTO/customer-return rate (above ~5.5% is a red flag). RTO (courier-undelivered) \
is policy-exempt from rating impact - only DTO (the customer's own return) counts against the seller.
3. CTR/CVR flywheel - rank drives impressions, impressions drive clicks, clicks drive orders, orders and reviews \
feed back into rank. A CTR floor around 0.5% is considered healthy.
4. Review volume - crossing roughly 50 genuine reviews is a reported organic-placement threshold.
5. Listing freshness - listings not refreshed in ~21 days are reported to decay in rank.
6. QC gate - a listing that fails Quality Check (image rules, title syntax, compliance) never enters ranking at \
all; this is invisible in most seller discussions but decisive in practice.

Snapdeal Ads (CPC bidding) and a personalization layer (Snapdeal's own engineering said it drives 35-40% of \
sales) sit on top of organic ranking as separate levers.

You will be given the seller's real current listings (price, MRP, stock, product rating, 30-day orders/sales/bad-\
rating%), account dashboard numbers, order-processing health, payments/settlements, ads performance, and the rule \
engine's currently open alerts. Give 3-5 prioritized, specific, actionable suggestions - name actual SKUs/numbers \
from the data, never generic advice like "improve your listings". Tie each suggestion to which lever it moves and \
why, using the thresholds above. If a genuinely important area has no data yet, say so rather than guessing.

This seller is a small two-person D2C team, not a large brand with an agency or ad budget on tap. Every \
suggestion must be reachable with that - concrete and doable this week, never advice that assumes a team, tool \
or spend they don't have ("run a full brand audit", "hire an agency"). If a fix genuinely needs money or a \
platform feature they may not have, say so plainly rather than assuming it.

After the prioritized fixes, add a short "Growth idea" line: one creative, low-cost, reachable idea that isn't \
about fixing a violation - something worth trying this month that plays to a lever above (a discount-band angle, \
a listing-freshness idea, a bundling idea). Skip it if you don't have one worth the seller's time.

If you were also given your own previous analysis, do not repeat it - open with what's changed since then, and \
say "no meaningful change since the last check" if nothing has. Keep the whole reply under 280 words."""

SCHEMA = """
CREATE TABLE IF NOT EXISTS ai_insights(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, summary TEXT NOT NULL, model TEXT, based_on TEXT);
"""


def _is_configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


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


def _previous_analysis() -> str | None:
    row = db.q("SELECT summary FROM ai_insights ORDER BY id DESC LIMIT 1")
    return row[0]["summary"] if row else None


def analyze_and_store() -> str:
    """Runs after every real sync. Returns a one-line status for the caller to log (never raises)."""
    with db.conn() as c:
        c.executescript(SCHEMA)

    if not _is_configured():
        return "skipped: ANTHROPIC_API_KEY not set"

    context = build_context()
    if not context["listings"] and not context["account_metrics"]:
        return "skipped: no real data yet"

    previous = _previous_analysis()
    payload: dict = {"data": context}
    if previous:
        payload["your_previous_analysis"] = previous

    try:
        import anthropic
        client = anthropic.Anthropic()
        message = client.messages.create(
            model=MODEL, max_tokens=500, system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(payload, default=str)}])
        summary = "".join(b.text for b in message.content if getattr(b, "type", None) == "text").strip()
        if not summary:
            return "failed: empty response"
    except Exception as exc:  # noqa: BLE001 - must never break the sync
        return f"failed: {type(exc).__name__}: {exc}"

    now = datetime.now().isoformat(timespec="seconds")
    with db.conn() as c:
        c.execute("INSERT INTO ai_insights(ts, summary, model, based_on) VALUES (?,?,?,?)",
                  (now, summary, MODEL, json.dumps({"listings": len(context["listings"]),
                                                     "open_alerts": len(context["open_alerts"])})))
    return "ok"
