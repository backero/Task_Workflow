"""AI strategic analysis - reads the real numbers job_digest just refreshed and asks Claude for prioritized,
specific suggestions grounded in how Flipkart's own ranking actually works (docs/flipkart_marketplace_deep_dive.md).

Same shape as Meesho's fkpulse/../ai_analysis.py, Snapdeal's app/ai_analysis.py and Amazon's
server/src/ai/analyze.ts: silently no-ops until ANTHROPIC_API_KEY is set, runs after every real data refresh
(called from scheduler.py's job_digest, which itself runs after every real Seller Hub read via finish_hub_read).
recommend.py's fixed-threshold rules stay the source of truth for "is this a violation"; this layer adds the
"what would actually move the needle" judgment a fixed rule can't make.
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

SYSTEM_PROMPT = """You are a Flipkart marketplace strategist. Flipkart does not rank listings directly - it ranks \
demonstrated conversion (units per impression). Roughly a million candidates are cut to page one primarily on \
this signal; position 1 captures about 40% of clicks against 2% at position 10. The five levers, from most to \
least controllable for a seller:

1. Listing completeness - blank attributes remove a product from filtered search results entirely. Aim for at \
least 90% attribute completeness.
2. Price competitiveness vs. the category/SERP median - an explicit ranking input; more than ~5% above the \
median actively handicaps position.
3. Review depth - pooled for the product's lifetime; a listing under 15 days old has no "Usual Price" yet, so \
paid ads are the only lever in that window. 15-20 reviews is roughly when algorithm-managed ad campaigns start \
outperforming manual ones.
4. Delivery speed via the F-Assured badge - only Flipkart-operated fulfilment unlocks it.
5. Paid placement - the lever that manufactures the velocity the other four amplify.

Seller health gates that cap visibility regardless of the above: cancellation rate (keep under 0.25%), RTD \
(dispatch) breach rate (keep under 0.5%), customer rating (keep at or above 4.2), and stock cover (keep at least \
14 days of cover to avoid a stockout cutting off a ranking listing mid-flight).

The ₹1,000 zero-commission cliff matters for pricing: a sub-₹1,000 SKU still pays fixed/collection/GST/TCS/TDS \
fees but avoids the 10-17% Beauty & Personal Care commission that kicks in above it - a ₹1,049 bundle can net \
less than a ₹999 one.

You will be given the seller's real current listings (price, MRP, stock, rating, days-on-hand), Seller Hub \
account metrics (traffic, ads, payments, returns), and the rule engine's currently open recommendations. Give \
3-5 prioritized, specific, actionable suggestions - name actual FSNs/SKUs/numbers from the data, never generic \
advice like "improve your listings". Tie each suggestion to which lever it moves and why, using the thresholds \
above. If a genuinely important area has no data yet, say so rather than guessing.

This seller is a small two-person D2C team, not a large brand with an agency or ad budget on tap. Every \
suggestion must be reachable with that - concrete and doable this week, never advice that assumes a team, tool \
or spend they don't have ("run a full brand audit", "hire an agency"). If a fix genuinely needs money or a \
platform feature they may not have (F-Assured enrolment, ads budget), say so plainly rather than assuming it.

After the prioritized fixes, add a short "Growth idea" line: one creative, low-cost, reachable idea that isn't \
about fixing a violation - something worth trying this month that plays to a lever above (a pricing-cliff angle, \
an event-calendar tie-in, a bundling idea). Skip it if you don't have one worth the seller's time.

If you were also given your own previous analysis, do not repeat it - open with what's changed since then, and \
say "no meaningful change since the last check" if nothing has. Keep the whole reply under 280 words."""

SCHEMA = """
CREATE TABLE IF NOT EXISTS ai_insights(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, summary TEXT NOT NULL, model TEXT, based_on TEXT);
"""


def _is_configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


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


def _previous_analysis(conn: sqlite3.Connection) -> str | None:
    row = conn.execute("SELECT summary FROM ai_insights ORDER BY id DESC LIMIT 1").fetchone()
    return row[0] if row else None


def analyze_and_store(db_path: str) -> str:
    """Runs after every real digest (which itself runs after every real Seller Hub read). Never raises."""
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA)
        if not _is_configured():
            return "skipped: ANTHROPIC_API_KEY not set"

        context = build_context(conn)
        if not context["listings"] and not context["account_metrics"]:
            return "skipped: no real data yet"

        previous = _previous_analysis(conn)
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
