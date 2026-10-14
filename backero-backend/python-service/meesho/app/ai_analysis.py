"""AI strategic analysis — reads the real numbers meesho_keeper just collected and asks TypeSafe's Jev model (docs.typesafe.ai) a fixed
set of sales-manager yes/no/score/choice questions grounded in how Meesho's own algorithm actually works
(How_Meesho_Marketplace_Algorithm_Works.md) — pricing risk, quality risk, fulfilment risk, urgency, priority area.
Not a narrative summary: Jev AI answers typed questions with probabilities/confidence, it doesn't write prose, so
this asks it to predict what's right/wrong rather than explain it (see python-service/jev_client.py).

Same shape as amazon/server/src/ai/analyze.ts: silently no-ops until TYPESAFE_API_KEY is set, runs after every real
data refresh (called from scheduler.py's _recompute, right after the rule engine), and is explicit that this is AI
reasoning over real data - never a source of new numbers. The rule engine's fixed-threshold alerts stay the source
of truth for "is this a violation"; this layer adds the predictive judgment a fixed rule can't make.
"""
from __future__ import annotations

import json
import os
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


def analyze_and_store(conn) -> str:
    """Runs after every real recompute. Returns a one-line status for the caller to log (never raises)."""
    conn.executescript(SCHEMA)
    if not _is_configured():
        return "skipped: TYPESAFE_API_KEY not set"

    context = build_context(conn)
    if not context["products"] and not context["account_metrics"]:
        return "skipped: no real data yet"

    try:
        predictions = jev_client.ask(context)
        summary = json.dumps(predictions)
    except Exception as exc:  # noqa: BLE001 - must never break recompute
        return f"failed: {type(exc).__name__}: {exc}"

    now = datetime.now().isoformat(timespec="seconds")
    conn.execute("INSERT INTO ai_insights(ts, summary, model, based_on) VALUES (?,?,?,?)",
                 (now, summary, MODEL, json.dumps({"products": len(context["products"]),
                                                    "open_findings": len(context["open_findings"])})))
    conn.commit()
    return "ok"
