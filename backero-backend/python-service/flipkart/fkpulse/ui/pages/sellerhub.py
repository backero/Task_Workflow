"""Seller Hub page — what Flipkart itself reports about the account (Business Health, traffic, ads, payouts, listing quality).

Reads only the hub_* tables filled by fkpulse.sellerhub; never calls Flipkart.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pandas as pd
import streamlit as st
import yaml

ROOT = Path(__file__).resolve().parents[3]


def _db() -> sqlite3.Connection:
    cfg = {}
    for name in ("config.yaml", "config.example.yaml"):
        path = ROOT / name
        if path.exists():
            cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            break
    raw = Path(str(cfg.get("db_path", "fk_pulse.db")))
    conn = sqlite3.connect(str(raw if raw.is_absolute() else ROOT / raw))
    conn.row_factory = sqlite3.Row
    return conn


def _m(conn, area: str, key: str):
    try:
        row = conn.execute("SELECT value FROM hub_metrics WHERE area=? AND key=? AND value IS NOT NULL ORDER BY captured_at DESC, id DESC LIMIT 1", (area, key)).fetchone()
    except sqlite3.OperationalError:
        return None
    return None if row is None else row[0]


def _card(col, label, value, limit=None, unit="%", higher_is_worse=True, fmt="{:.2f}"):
    if value is None:
        col.metric(label, "—")
        return
    text = fmt.format(value) + unit
    if limit is None:
        col.metric(label, text)
        return
    bad = value > limit if higher_is_worse else value < limit
    col.metric(label, text, delta=f"limit {limit}{unit}", delta_color="inverse" if bad else "off")


st.title("Seller Hub")
conn = _db()
last = None
try:
    row = conn.execute("SELECT MAX(captured_at) FROM hub_metrics").fetchone()
    last = row[0] if row else None
except sqlite3.OperationalError:
    pass

if not last:
    st.info("Seller Hub has not been read yet. Sign in once with `python scripts/sellerhub_login.py`; the scheduler then reads it every few hours.")
    st.stop()
st.caption(f"Read from Flipkart Seller Hub on {last.replace('T', ' ')}. These are Flipkart's own figures.")

st.subheader("Business health — what Flipkart judges you on (last 30 days)")
c = st.columns(4)
_card(c[0], "Seller cancellations", _m(conn, "business_health", "seller_cancel_pct"), 0.25)
_card(c[1], "Dispatch-by-date breaches", _m(conn, "business_health", "dbd_breach_pct"), 0.5, fmt="{:.1f}")
_card(c[2], "Pre-dispatch cancellations", _m(conn, "business_health", "pre_dispatch_cancel_pct"), 0.25)
_card(c[3], "Logistics returns (RTO)", _m(conn, "business_health", "rto_pct"), 20.0)
c = st.columns(4)
_card(c[0], "Buyer returns", _m(conn, "business_health", "buyer_returns_pct"))
_card(c[1], "Price-competitive listings", _m(conn, "business_health", "competitive_flipkart_pct"), 60.0, higher_is_worse=False, fmt="{:.0f}")
_card(c[2], "Listings rated Average/Bad", _m(conn, "business_health", "low_quality_listings"), unit=" of 32", fmt="{:.0f}")
_card(c[3], "Blocked listings", _m(conn, "listing_states", "blocked"), 0, unit="", fmt="{:.0f}")

st.subheader("Traffic")
now, prev = _m(conn, "traffic", "impressions_30d"), _m(conn, "traffic", "impressions_prev_30d")
c = st.columns(4)
if now is not None and prev:
    c[0].metric("Impressions (30d)", f"{now:,.0f}", delta=f"{(now - prev) / prev * 100:.0f}% vs previous 30d")
c[1].metric("Units sold (30d)", f"{_m(conn, 'traffic', 'units_30d') or 0:,.0f}", delta=f"was {_m(conn, 'traffic', 'units_prev_30d') or 0:,.0f}")
c[2].metric("Sales (30d)", f"₹{_m(conn, 'traffic', 'sales_30d') or 0:,.0f}")
c[3].metric("Conversion (30d)", f"{_m(conn, 'traffic', 'conversion_30d_pct') or 0:.2f}%")
try:
    drops = pd.read_sql_query("SELECT sku AS SKU, impressions_drop AS 'Impressions lost', units_lost AS 'Units lost' FROM hub_traffic_drops WHERE captured_at = (SELECT MAX(captured_at) FROM hub_traffic_drops)", conn)
    if not drops.empty:
        st.caption("Listings losing the most impressions")
        st.dataframe(drops, hide_index=True, width="stretch")
except (sqlite3.OperationalError, pd.errors.DatabaseError):
    pass

st.subheader("Ads")
c = st.columns(4)
c[0].metric("Ad spend (range)", f"₹{_m(conn, 'ads', 'spend') or 0:,.0f}")
roi = _m(conn, "ads", "roi")
c[1].metric("ROI (revenue ÷ spend)", f"{roi:.2f}" if roi is not None else "—", delta="below 2 is likely a loss" if roi is not None and roi < 2 else None, delta_color="inverse")
c[2].metric("Revenue from ads", f"₹{_m(conn, 'ads', 'revenue') or 0:,.0f}")
c[3].metric("Wallet", f"₹{_m(conn, 'ads', 'wallet_balance') or 0:,.0f}")
try:
    camps = pd.read_sql_query(
        """SELECT name AS Campaign, status AS Status, kind AS Type, spend AS Spend, views AS Views, clicks AS Clicks, units AS Units, revenue AS Revenue, roi AS ROI
           FROM hub_ads_campaigns WHERE captured_at = (SELECT MAX(captured_at) FROM hub_ads_campaigns) ORDER BY spend DESC""", conn)
    if not camps.empty:
        st.dataframe(camps, hide_index=True, width="stretch")
    total, read = _m(conn, "ads", "campaigns_total"), _m(conn, "ads", "campaigns_read")
    if total and read and read < total:
        st.caption(f"Showing {int(read)} of {int(total)} campaigns — Flipkart loads the rest lazily; the totals above cover all of them.")
except (sqlite3.OperationalError, pd.errors.DatabaseError):
    pass

st.subheader("Orders waiting to be packed (\"To Accept\" queue, by SKU)")
st.caption("From the same page as the order pipeline above — which SKUs make up today's unaccepted orders, and at what price. Not a full order history: no order ID, buyer or date.")
try:
    pending = pd.read_sql_query(
        """SELECT sku AS SKU, title AS Title, qty AS Qty, orders AS 'Orders in group',
                  CASE WHEN price_low = price_high THEN printf('₹%.0f', price_low) ELSE printf('₹%.0f – ₹%.0f', price_low, price_high) END AS Price
           FROM hub_pending_order_groups WHERE captured_at = (SELECT MAX(captured_at) FROM hub_pending_order_groups)
           ORDER BY orders DESC, sku""", conn)
    if pending.empty:
        st.caption("Nothing pending right now.")
    else:
        st.dataframe(pending, hide_index=True, width="stretch")
except (sqlite3.OperationalError, pd.errors.DatabaseError):
    pass

st.subheader("Returns")
c = st.columns(2)
c[0].metric("In progress", f"{_m(conn, 'returns', 'in_progress') or 0:.0f}")
c[1].metric("Completed", f"{_m(conn, 'returns', 'completed') or 0:.0f}")

st.subheader("Payouts")
c = st.columns(3)
c[0].metric("Payouts that were ₹0", f"{_m(conn, 'payments', 'previous_payouts_zero') or 0:.0f} of {_m(conn, 'payments', 'previous_payouts_listed') or 0:.0f}")
c[1].metric("Next payout estimate (postpaid)", f"₹{_m(conn, 'payments', 'estimate_0_postpaid') or 0:,.0f}")
c[2].metric("Outstanding amount", f"₹{_m(conn, 'payments', 'outstanding_amount') or 0:,.0f}")
if _m(conn, "payments", "net_payable_negative"):
    st.error("Flipkart reports **net payable value was negative** — returns, fees and ad spend exceeded sales, so recent payouts were held back.")

st.subheader("Listing quality (Flipkart's own label)")
try:
    rows = pd.read_sql_query(
        """SELECT sku AS SKU, category AS Category, quality AS Quality, rating AS Rating, price AS Price, final_price AS 'Customer pays', stock AS Stock, return_rate_pct AS 'Return %'
           FROM hub_listing_rows WHERE captured_at = (SELECT MAX(captured_at) FROM hub_listing_rows) ORDER BY CASE quality WHEN 'Bad' THEN 0 WHEN 'Poor' THEN 0 WHEN 'Average' THEN 1 ELSE 2 END, sku""", conn)
    st.dataframe(rows, hide_index=True, width="stretch")
except (sqlite3.OperationalError, pd.errors.DatabaseError):
    st.caption("No listing rows read yet.")
