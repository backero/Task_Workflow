"""FK-Pulse KPI engine (Agent B).

Pure functions over the SQLite DB. ``compute_all`` writes one row per KPI into
``metrics_snapshots`` (scope: ``account`` or ``fsn:<FSN>``) and returns the
number of rows written.

All window math uses an injectable ``now`` datetime so tests are deterministic.

Rating/review velocity note: the DB stores only the *current* rating_count per
listing (no rating-event history), so velocity is derived from our own
``metrics_snapshots`` history: each ``rating_avg`` snapshot carries the current
rating_count in its ``detail`` JSON, and velocity = (count_now - count_at_least_
7_days_ago) / 7. NULL until a >=7-day-old baseline snapshot exists.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any

# Window constants (days)
ORDERS_WINDOW_DAYS = 30
VELOCITY_WINDOW_DAYS = 7
RANK_WINDOW_DAYS = 7
SETTLEMENT_WINDOW_DAYS = 30
ADS_WINDOW_DAYS = 30

# Usual Price rule: listings younger than this many days may not run promotions
USUAL_PRICE_WINDOW_DAYS = 15
# image_count_ok threshold (spec: 1/0 vs >=3)
IMAGE_COUNT_MIN = 3


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _parse_attrs(attributes_json: str | None) -> dict[str, Any]:
    if not attributes_json:
        return {}
    try:
        data = json.loads(attributes_json)
        return data if isinstance(data, dict) else {}
    except (ValueError, TypeError):
        return {}


def _filled_attributes(attrs: dict[str, Any]) -> int:
    return sum(1 for v in attrs.values() if v not in (None, "", [], {}))


def _round(value: float | None) -> float | None:
    return round(value, 6) if value is not None else None


def _velocity_from_snapshots(
    conn: sqlite3.Connection,
    scope: str,
    key: str,
    current_count: int,
    now: datetime,
) -> float | None:
    """New ratings/day over the last 7 days, using snapshot history as baseline.

    Returns None when no baseline snapshot at least 7 days old exists.
    """
    row = conn.execute(
        """SELECT detail FROM metrics_snapshots
           WHERE scope = ? AND key = ?
             AND julianday(computed_at) <= julianday(?) - ?
           ORDER BY id DESC LIMIT 1""",
        (scope, key, now.isoformat(), VELOCITY_WINDOW_DAYS),
    ).fetchone()
    if row is None or not row["detail"]:
        return None
    try:
        baseline = json.loads(row["detail"]).get("rating_count")
    except (ValueError, TypeError):
        return None
    if baseline is None:
        return None
    return _round((current_count - baseline) / VELOCITY_WINDOW_DAYS)


def _account_kpis(conn: sqlite3.Connection, now: datetime) -> list[tuple]:
    """Return list of (scope, key, value, detail) rows for account scope."""
    rows: list[tuple] = []
    scope = "account"
    now_iso = now.isoformat()

    # --- order health rates over last 30d --------------------------------
    o = conn.execute(
        """SELECT COUNT(*) AS n,
                  SUM(CASE WHEN cancelled = 1 OR status = 'CANCELLED'
                           THEN 1 ELSE 0 END) AS cancelled,
                  COALESCE(SUM(rtd_breach), 0) AS rtd,
                  COALESCE(SUM(rto), 0) AS rto,
                  SUM(CASE WHEN payment_type = 'COD' THEN 1 ELSE 0 END) AS cod
           FROM orders
           WHERE julianday(order_date) >= julianday(?) - ?""",
        (now_iso, ORDERS_WINDOW_DAYS),
    ).fetchone()
    n = o["n"] or 0
    rows.append((scope, "cancellation_rate_30d",
                 _round(o["cancelled"] / n) if n else None, None))
    rows.append((scope, "rtd_breach_rate_30d",
                 _round(o["rtd"] / n) if n else None, None))
    rows.append((scope, "rto_rate_30d",
                 _round(o["rto"] / n) if n else None, None))
    rows.append((scope, "cod_share_30d",
                 _round(o["cod"] / n) if n else None, None))

    # --- weighted account rating ------------------------------------------
    r = conn.execute(
        """SELECT SUM(rating_avg * rating_count) AS weighted,
                  SUM(rating_count) AS total_count
           FROM listings
           WHERE rating_count > 0 AND rating_avg IS NOT NULL"""
    ).fetchone()
    total_count = r["total_count"] or 0
    weighted = (r["weighted"] / total_count) if total_count else None
    rows.append((scope, "rating_avg_weighted", _round(weighted),
                 json.dumps({"rating_count": total_count})))

    # --- review velocity (new ratings/day, 7d) -----------------------------
    velocity = _velocity_from_snapshots(
        conn, scope, "rating_avg_weighted", total_count, now)
    rows.append((scope, "review_velocity_7d", velocity, None))

    # --- settlement lag -----------------------------------------------------
    s = conn.execute(
        """SELECT AVG(julianday(settled_date) - julianday(order_date)) AS lag
           FROM settlements
           WHERE settled_date IS NOT NULL AND order_date IS NOT NULL
             AND julianday(settled_date) >= julianday(?) - ?""",
        (now_iso, SETTLEMENT_WINDOW_DAYS),
    ).fetchone()
    rows.append((scope, "settlement_lag_days_avg", _round(s["lag"]), None))

    # --- TACoS (ad spend / ad sales, 30d); NULL if no ad data ----------------
    a = conn.execute(
        """SELECT COALESCE(SUM(spend), 0) AS spend,
                  COALESCE(SUM(sales), 0) AS sales,
                  COUNT(*) AS rows_n
           FROM ad_spend
           WHERE julianday(date) >= julianday(?) - ?""",
        (now_iso, ADS_WINDOW_DAYS),
    ).fetchone()
    tacos = None
    if a["rows_n"] and a["sales"]:
        tacos = _round(a["spend"] / a["sales"])
    rows.append((scope, "tacos_30d", tacos, None))

    return rows


def _fsn_kpis(conn: sqlite3.Connection, now: datetime) -> list[tuple]:
    """Return list of (scope, key, value, detail) rows for every listing."""
    rows: list[tuple] = []
    now_iso = now.isoformat()
    listings = conn.execute("SELECT * FROM listings").fetchall()

    for l in listings:
        fsn = l["fsn"]
        scope = f"fsn:{fsn}"

        # --- attribute completeness (filled / template total) --------------
        attrs = _parse_attrs(l["attributes_json"])
        filled = _filled_attributes(attrs)
        total = l["attributes_total"] or 0
        completeness = _round(filled / total) if total else None
        rows.append((scope, "attribute_completeness", completeness,
                     json.dumps({"filled": filled, "total": total})))

        # --- image count compliance (>= 3 images) ---------------------------
        images = l["image_count"] or 0
        rows.append((scope, "image_count_ok",
                     1.0 if images >= IMAGE_COUNT_MIN else 0.0, None))

        # --- rating + velocity ----------------------------------------------
        rating_count = l["rating_count"] or 0
        rows.append((scope, "rating_avg", _round(l["rating_avg"]),
                     json.dumps({"rating_count": rating_count})))
        velocity = _velocity_from_snapshots(
            conn, scope, "rating_avg", rating_count, now)
        rows.append((scope, "rating_velocity_7d", velocity, None))

        # --- stock cover days (stock / avg daily units 30d) ------------------
        u = conn.execute(
            """SELECT COALESCE(SUM(qty), 0) AS units FROM orders
               WHERE fsn = ? AND cancelled = 0 AND status != 'CANCELLED'
                 AND julianday(order_date) >= julianday(?) - ?""",
            (fsn, now_iso, ORDERS_WINDOW_DAYS),
        ).fetchone()
        avg_daily = (u["units"] or 0) / ORDERS_WINDOW_DAYS
        stock = l["stock"] or 0
        cover = _round(stock / avg_daily) if avg_daily > 0 else None
        rows.append((scope, "stock_cover_days", cover,
                     json.dumps({"avg_daily_units": round(avg_daily, 6),
                                 "stock": stock})))

        # --- price vs latest SERP median --------------------------------------
        m = conn.execute(
            """SELECT serp_median_price FROM rank_history
               WHERE fsn = ? AND serp_median_price IS NOT NULL
               ORDER BY fetched_at DESC, id DESC LIMIT 1""",
            (fsn,),
        ).fetchone()
        pvm = None
        if m and m["serp_median_price"] and l["price"]:
            pvm = _round(l["price"] / m["serp_median_price"])
        rows.append((scope, "price_vs_median", pvm, None))

        # --- best rank per keyword over last 7d (one row per keyword) ---------
        for rk in conn.execute(
            """SELECT keyword, MIN(position) AS best FROM rank_history
               WHERE fsn = ? AND position IS NOT NULL
                 AND julianday(fetched_at) >= julianday(?) - ?
               GROUP BY keyword""",
            (fsn, now_iso, RANK_WINDOW_DAYS),
        ).fetchall():
            rows.append((scope, "rank_best_position_7d", float(rk["best"]),
                         rk["keyword"]))

        # --- usual price window (listed < 15 days -> 1) ------------------------
        upw = None
        if l["listed_date"]:
            try:
                listed = datetime.fromisoformat(str(l["listed_date"]))
                age_days = (now - listed).days
                upw = 1.0 if 0 <= age_days < USUAL_PRICE_WINDOW_DAYS else 0.0
            except ValueError:
                upw = None
        rows.append((scope, "usual_price_window_open", upw, None))

        # --- title keyword coverage (head term present in title) --------------
        kws = conn.execute(
            "SELECT keyword FROM tracked_keywords WHERE fsn = ? AND active = 1",
            (fsn,),
        ).fetchall()
        coverage = None
        missing: list[str] = []
        if kws:
            title = (l["title"] or "").lower()
            hits = 0
            for k in kws:
                head = str(k["keyword"]).split()[0] if k["keyword"] else ""
                if head and head.lower() in title:
                    hits += 1
                elif head:
                    missing.append(head)
            coverage = _round(hits / len(kws))
        rows.append((scope, "title_keyword_coverage", coverage,
                     json.dumps({"missing_head_terms": missing})))

    return rows


def compute_all(db_path: str, config: dict,
                now: datetime | None = None) -> int:
    """Compute all account + per-FSN KPIs and write metrics_snapshots rows.

    ``config`` is accepted for interface symmetry (thresholds live in
    recommend.py); ``now`` is injectable for deterministic tests.
    Returns the number of snapshot rows written.
    """
    now = now or datetime.now()
    conn = _connect(db_path)
    try:
        rows = _account_kpis(conn, now) + _fsn_kpis(conn, now)
        computed_at = now.isoformat()
        conn.executemany(
            """INSERT INTO metrics_snapshots(scope, key, value, detail, computed_at)
               VALUES (?, ?, ?, ?, ?)""",
            [(scope, key, value, detail, computed_at)
             for scope, key, value, detail in rows],
        )
        conn.commit()
        return len(rows)
    finally:
        conn.close()
