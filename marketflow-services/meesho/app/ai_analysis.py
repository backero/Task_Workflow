"""AI strategic analysis — reads the real numbers meesho_keeper just collected and asks Claude for prioritized,
specific suggestions grounded in how Meesho's own algorithm actually works (How_Meesho_Marketplace_Algorithm_Works.md).

Same shape as amazon/server/src/ai/analyze.ts: silently no-ops until ANTHROPIC_API_KEY is set, runs after every
real data refresh (called from scheduler.py's _recompute, right after the rule engine), and is explicit that this
is AI reasoning over real data - never a source of new numbers. The rule engine's fixed-threshold alerts stay the
source of truth for "is this a violation"; this layer adds the "what would actually move the needle" judgment a
fixed rule can't make.
"""
from __future__ import annotations

import json
import os
from datetime import datetime

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

SYSTEM_PROMPT = """You are a Meesho marketplace strategist. Meesho's ranking is a transaction-probability engine \
built on six signal groups, in rough order of leverage:

1. Price - the lowest-priced listing for a given product design captures roughly 90% of that design's visibility \
and orders. Price dominance beats almost everything else.
2. Quality Score - the share of a catalogue's ratings that are 1-2 star. Under ~15% is normal visibility; \
15-25% throttles impressions; above ~25% the catalogue gets blocked. It needs a minimum number of ratings \
before it means anything - a bad score from 2 ratings is noise, not a pattern.
3. Engagement (CTR/CVR) - clicks and orders per view/click. Conversion velocity is close to the core ranking \
objective.
4. Fulfilment - dispatch SLA and NDD (Next Day Dispatch) status. Missed dispatch health blocks catalogues \
outright, independent of everything else.
5. Returns/RTO - a single return on a low-ticket order can erase the margin of several successful ones; the \
algorithm punishes return rate directly.
6. Account activity - upload cadence, listing freshness, and a rolling account-level trust window.

Paid Ads sit on top of this as a separate layer (CPC bidding for placement) - ad spend does not itself move \
organic rank, but the orders it drives feed the same conversion signal.

You will be given the seller's real current account numbers, real per-product data (views/clicks/orders/sales/\
rating), pricing vs. Meesho's own recommended price, dispatch health, and the rule engine's currently open \
findings. Give 3-5 prioritized, specific, actionable suggestions - name actual products/numbers from the data, \
never generic advice like "improve your listings". Tie each suggestion to which signal group it moves and why, \
using the thresholds above. If a genuinely important area has no data yet, say so rather than guessing.

This seller is a small two-person D2C team, not a large brand with an agency or ad budget on tap. Every \
suggestion must be something reachable with that - concrete and doable this week, never advice that assumes a \
team, tool or spend they don't have ("run a full brand audit", "hire an agency", "A/B test with a growth team"). \
If a fix genuinely needs money or a platform feature they may not have (NDD enrolment, ads budget), say so \
plainly rather than assuming it.

After the prioritized fixes, add a short "Growth idea" line: one creative, low-cost, reachable idea that isn't \
about fixing a violation - something worth trying this month that plays to a signal group above (a catalogue \
angle, a pricing experiment, a bundling idea). Skip it if you don't have one worth the seller's time; a bad idea \
is worse than no idea.

If you were also given your own previous analysis, do not repeat it - open with what's changed since then, and \
say "no meaningful change since the last check" if nothing has. Keep the whole reply under 280 words."""

SCHEMA = """
CREATE TABLE IF NOT EXISTS ai_insights(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, summary TEXT NOT NULL, model TEXT, based_on TEXT);
"""


def _is_configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def build_context(conn) -> dict:
    """Real current data only - the same tables the dashboard itself reads from."""
    latest_area = {}
    for area, key, value, text in conn.execute(
            "SELECT area, key, value, text FROM panel_metrics WHERE id IN "
            "(SELECT MAX(id) FROM panel_metrics GROUP BY area, key)"):
        latest_area.setdefault(area, {})[key] = value if value is not None else text

    products = [dict(r) for r in conn.execute(
        "SELECT product_id, title, rating, views, clicks, orders, sales, returns_pct FROM panel_products "
        "ORDER BY views DESC")]

    pricing = [dict(r) for r in conn.execute(
        "SELECT catalog_id, title, stock, price, recommended_price, insight FROM panel_pricing")]

    findings = [dict(r) for r in conn.execute(
        "SELECT priority, title, reason FROM recommendations WHERE status='open' ORDER BY id DESC LIMIT 30")]

    return {"account_metrics": latest_area, "products": products, "pricing": pricing, "open_findings": findings}


def _previous_analysis(conn) -> str | None:
    row = conn.execute("SELECT summary FROM ai_insights ORDER BY id DESC LIMIT 1").fetchone()
    return row["summary"] if row else None


def analyze_and_store(conn) -> str:
    """Runs after every real recompute. Returns a one-line status for the caller to log (never raises)."""
    conn.executescript(SCHEMA)
    if not _is_configured():
        return "skipped: ANTHROPIC_API_KEY not set"

    context = build_context(conn)
    if not context["products"] and not context["account_metrics"]:
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
    except Exception as exc:  # noqa: BLE001 - must never break recompute
        return f"failed: {type(exc).__name__}: {exc}"

    now = datetime.now().isoformat(timespec="seconds")
    conn.execute("INSERT INTO ai_insights(ts, summary, model, based_on) VALUES (?,?,?,?)",
                 (now, summary, MODEL, json.dumps({"products": len(context["products"]),
                                                    "open_findings": len(context["open_findings"])})))
    conn.commit()
    return "ok"
