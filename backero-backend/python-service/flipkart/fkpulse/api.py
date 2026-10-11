"""A small read-only JSON API over fk_pulse.db, for the unified cross-platform dashboard (a separate app - see
amazon/web) to consume. Flipkart's own Streamlit dashboard (run_dashboard.py) is unaffected by this - it still
reads the database directly in-process. This is purely an additional read surface for something else to consume,
mirroring the /api/* Meesho and Snapdeal already expose.

Run:  python run_api.py   (defaults to port 8600)
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date, timedelta
from pathlib import Path

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "fk_pulse.db"

app = FastAPI(title="FK-Pulse API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"])


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _load_config() -> dict:
    for name in ("config.yaml", "config.example.yaml"):
        path = ROOT / name
        if path.exists():
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8"))
                return data if isinstance(data, dict) else {}
            except (OSError, yaml.YAMLError):
                return {}
    return {}


@app.get("/api/overview")
def overview():
    with _conn() as c:
        listings = c.execute("SELECT COUNT(*) n FROM listings").fetchone()["n"]
        active = c.execute("SELECT COUNT(*) n FROM listings WHERE status='ACTIVE'").fetchone()["n"]
        avg_rating = c.execute("SELECT AVG(rating_avg) a FROM listings WHERE rating_avg IS NOT NULL").fetchone()["a"]
        open_recs = c.execute("SELECT severity, COUNT(*) n FROM recommendations WHERE status='open' GROUP BY severity").fetchall()
        latest = {}
        for row in c.execute("SELECT area, key, value, text FROM hub_metrics WHERE id IN "
                             "(SELECT MAX(id) FROM hub_metrics GROUP BY area, key)"):
            latest.setdefault(row["area"], {})[row["key"]] = row["value"] if row["value"] is not None else row["text"]
        return {"listings": listings, "active": active, "avg_rating": avg_rating,
                "open_recommendations": {r["severity"]: r["n"] for r in open_recs}, "account_metrics": latest}


@app.get("/api/listings")
def listings():
    with _conn() as c:
        rows = c.execute("SELECT fsn, sku, title, brand, price, mrp, stock, status, rating_avg, rating_count, "
                         "review_count FROM listings ORDER BY rating_count DESC").fetchall()
        hub = {r["sku"]: dict(r) for r in c.execute(
            "SELECT sku, days_on_hand, return_rate_pct, quality FROM hub_listing_rows "
            "WHERE captured_at = (SELECT MAX(captured_at) FROM hub_listing_rows)")}
        out = []
        for r in rows:
            d = dict(r)
            d["hub"] = hub.get(r["sku"])
            out.append(d)
        return out


@app.get("/api/recommendations")
def recommendations(status: str = "open"):
    with _conn() as c:
        rows = c.execute(
            "SELECT id, scope, fsn, rule_id, severity, title, detail, status, created_at FROM recommendations "
            "WHERE status=? ORDER BY id DESC LIMIT 200", (status,)).fetchall()
        return [dict(r) for r in rows]


@app.post("/api/recommendations/{rec_id}/done")
def recommendation_done(rec_id: int):
    with _conn() as c:
        c.execute("UPDATE recommendations SET status='done' WHERE id=?", (rec_id,))
    return {"ok": True}


@app.get("/api/ai_insights")
def ai_insights():
    with _conn() as c:
        c.executescript("CREATE TABLE IF NOT EXISTS ai_insights(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, "
                        "summary TEXT NOT NULL, model TEXT, based_on TEXT)")
        rows = c.execute("SELECT id, ts, summary, model FROM ai_insights ORDER BY id DESC LIMIT 10").fetchall()
        return [dict(r) for r in rows]


@app.get("/api/robot")
def robot():
    with _conn() as c:
        row = c.execute("SELECT value FROM kv_config WHERE key='robot_state'").fetchone()
        return json.loads(row["value"]) if row else {"state": "silent", "message": "No heartbeat recorded yet."}


_ACCOUNT_KPIS = [
    ("cancellation_rate_30d", "Cancellation rate (30d)", "cancellation_max", 0.0025, False),
    ("rtd_breach_rate_30d", "RTD breach rate (30d)", "rtd_breach_max", 0.005, False),
    ("rto_rate_30d", "RTO rate (30d)", None, 0.20, False),
    ("rating_avg_weighted", "Rating (weighted)", "rating_min", 4.2, True),
    ("settlement_lag_days_avg", "Settlement lag (days)", None, 12.0, False),
    ("tacos_30d", "TACoS (30d)", None, 0.35, False),
]


@app.get("/api/account")
def account():
    thresholds = _load_config().get("thresholds", {}) or {}
    with _conn() as c:
        latest_rows = c.execute(
            """SELECT m.key, m.value FROM metrics_snapshots m
               JOIN (SELECT key, MAX(computed_at) AS mx FROM metrics_snapshots
                     WHERE scope='account' GROUP BY key) t
                 ON m.key = t.key AND m.computed_at = t.mx
               WHERE m.scope='account'"""
        ).fetchall()
        latest = {r["key"]: r["value"] for r in latest_rows}
        trend_rows = c.execute(
            "SELECT key, value, computed_at FROM metrics_snapshots WHERE scope='account' ORDER BY computed_at"
        ).fetchall()
    kpis = []
    for key, label, thr_key, thr_default, higher_ok in _ACCOUNT_KPIS:
        thr = float(thresholds.get(thr_key, thr_default)) if thr_key else thr_default
        val = latest.get(key)
        ok = None if val is None else ((val >= thr) if higher_ok else (val <= thr))
        kpis.append({"key": key, "label": label, "value": val, "threshold": thr, "higher_is_better": higher_ok, "within_threshold": ok})
    return {"kpis": kpis, "trends": [dict(r) for r in trend_rows]}


@app.get("/api/sellerhub")
def sellerhub():
    with _conn() as c:
        def q(sql: str) -> list[dict]:
            try:
                return [dict(r) for r in c.execute(sql).fetchall()]
            except sqlite3.OperationalError:
                return []
        traffic_drops = q(
            "SELECT sku, impressions_drop, units_lost FROM hub_traffic_drops "
            "WHERE captured_at = (SELECT MAX(captured_at) FROM hub_traffic_drops)"
        )
        ads_campaigns = q(
            "SELECT name, status, kind, spend, views, clicks, units, revenue, roi FROM hub_ads_campaigns "
            "WHERE captured_at = (SELECT MAX(captured_at) FROM hub_ads_campaigns) ORDER BY spend DESC"
        )
        pending_order_groups = q(
            "SELECT sku, title, qty, orders, price_low, price_high FROM hub_pending_order_groups "
            "WHERE captured_at = (SELECT MAX(captured_at) FROM hub_pending_order_groups) ORDER BY orders DESC, sku"
        )
        listing_rows = q(
            "SELECT sku, category, quality, rating, price, final_price, stock, return_rate_pct FROM hub_listing_rows "
            "WHERE captured_at = (SELECT MAX(captured_at) FROM hub_listing_rows) "
            "ORDER BY CASE quality WHEN 'Bad' THEN 0 WHEN 'Poor' THEN 0 WHEN 'Average' THEN 1 ELSE 2 END, sku"
        )
        return {
            "traffic_drops": traffic_drops, "ads_campaigns": ads_campaigns,
            "pending_order_groups": pending_order_groups, "listing_rows": listing_rows,
        }


@app.get("/api/rank")
def rank():
    with _conn() as c:
        keywords = c.execute(
            "SELECT k.id, k.fsn, k.keyword, k.active, l.title FROM tracked_keywords k "
            "LEFT JOIN listings l ON l.fsn = k.fsn WHERE k.active=1 ORDER BY l.title, k.keyword"
        ).fetchall()
        history = c.execute(
            "SELECT fsn, keyword, position, page, serp_median_price, fetched_at FROM rank_history ORDER BY fetched_at"
        ).fetchall()
        latest = c.execute(
            """SELECT r.fsn, r.keyword, r.position, r.page, r.serp_median_price, r.fetched_at
               FROM rank_history r
               JOIN (SELECT fsn, keyword, MAX(fetched_at) AS mx FROM rank_history GROUP BY fsn, keyword) t
                 ON r.fsn = t.fsn AND r.keyword = t.keyword AND r.fetched_at = t.mx
               ORDER BY r.keyword, r.position"""
        ).fetchall()
        return {"keywords": [dict(r) for r in keywords], "history": [dict(r) for r in history],
                "latest": [dict(r) for r in latest]}


@app.get("/api/pricing")
def pricing():
    thr = float((_load_config().get("thresholds", {}) or {}).get("price_vs_median_max", 1.05))
    with _conn() as c:
        med = {r["fsn"]: r["serp_median_price"] for r in c.execute(
            """SELECT r.fsn, r.serp_median_price FROM rank_history r
               JOIN (SELECT fsn, MAX(fetched_at) AS mx FROM rank_history
                     WHERE serp_median_price IS NOT NULL GROUP BY fsn) t
                 ON r.fsn = t.fsn AND r.fetched_at = t.mx"""
        ).fetchall()}
        listings_rows = c.execute("SELECT fsn, title, price FROM listings").fetchall()
    out = []
    for l in listings_rows:
        m = med.get(l["fsn"])
        if m is None or not l["price"]:
            continue
        ratio = l["price"] / m
        out.append({
            "fsn": l["fsn"], "title": l["title"], "price": l["price"], "serp_median_price": m,
            "vs_median_pct": (ratio - 1.0) * 100, "flag": "ABOVE LIMIT" if ratio > thr else "ok",
        })
    out.sort(key=lambda r: r["vs_median_pct"], reverse=True)
    return {
        "price_vs_median": out, "threshold_pct": (thr - 1.0) * 100,
        "cliff": {"cliff_price": 1000.0, "commission_below": 0.08, "commission_above": 0.12, "reposition_target": 999.0},
    }


_EVENTS = [("Big Billion Days", 9, 22), ("Diwali sale", 10, 20)]
_USUAL_PRICE_DAYS = 15
_DEAL_LEAD_DAYS = 56


def _next_event(month: int, day: int, today: date) -> date:
    d = date(today.year, month, day)
    return d if d >= today else date(today.year + 1, month, day)


@app.get("/api/calendar")
def calendar():
    today = date.today()
    events = []
    for name, month, day in _EVENTS:
        nxt = _next_event(month, day, today)
        events.append({"name": name, "next_date": nxt.isoformat(), "days": (nxt - today).days,
                       "nominate_now": 0 < (nxt - today).days <= _DEAL_LEAD_DAYS})
    with _conn() as c:
        rows = c.execute(
            "SELECT fsn, title, price, listed_date FROM listings "
            "WHERE listed_date IS NOT NULL AND listed_date != '' ORDER BY listed_date DESC"
        ).fetchall()
    usual_price = []
    for r in rows:
        try:
            listed = date.fromisoformat(str(r["listed_date"])[:10])
        except ValueError:
            continue
        window_end = listed + timedelta(days=_USUAL_PRICE_DAYS)
        age = (today - listed).days
        open_now = age < _USUAL_PRICE_DAYS
        usual_price.append({
            "fsn": r["fsn"], "title": r["title"], "price": r["price"], "listed_date": listed.isoformat(),
            "window_ends": window_end.isoformat(), "day": min(age + 1, _USUAL_PRICE_DAYS),
            "open": open_now,
        })
    return {"events": events, "usual_price_days": _USUAL_PRICE_DAYS, "usual_price": usual_price}


@app.get("/api/returns")
def returns():
    with _conn() as c:
        by_sku = c.execute(
            """SELECT o.fsn, COALESCE(l.title, o.fsn) AS title,
                      COUNT(DISTINCT o.order_id) AS orders,
                      SUM(CASE WHEN r.type='COURIER_RTO' THEN 1 ELSE 0 END) AS rto
               FROM orders o LEFT JOIN returns r ON r.order_id = o.order_id
               LEFT JOIN listings l ON l.fsn = o.fsn GROUP BY o.fsn ORDER BY rto DESC"""
        ).fetchall()
        by_pincode = c.execute(
            """SELECT o.pincode, COUNT(*) AS rto_count FROM returns r JOIN orders o ON o.order_id = r.order_id
               WHERE r.type='COURIER_RTO' AND o.pincode IS NOT NULL AND o.pincode != ''
               GROUP BY o.pincode ORDER BY rto_count DESC LIMIT 10"""
        ).fetchall()
        cod_split = c.execute(
            """SELECT COALESCE(o.payment_type, 'UNKNOWN') AS payment_type,
                      COUNT(DISTINCT o.order_id) AS orders,
                      SUM(CASE WHEN r.type='COURIER_RTO' THEN 1 ELSE 0 END) AS rto
               FROM orders o LEFT JOIN returns r ON r.order_id = o.order_id GROUP BY payment_type"""
        ).fetchall()
    def with_rate(rows):
        out = []
        for r in rows:
            d = dict(r)
            d["rto_rate_pct"] = (d["rto"] / d["orders"] * 100) if d.get("orders") else 0
            out.append(d)
        return out
    return {"by_sku": with_rate(by_sku), "by_pincode": [dict(r) for r in by_pincode], "cod_split": with_rate(cod_split)}
