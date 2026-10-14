"""Pricing & Fees page — price vs SERP median + commission-cliff advisor.

Commission-cliff model is an explicit, documented assumption set (see
_ASSUMPTIONS); the widget always shows the Seller Hub disclaimer.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st
import yaml

ROOT = Path(__file__).resolve().parents[3]
PALETTE = ["#8B7355", "#A6A6A6", "#C4B7A6", "#B5C4B1", "#D4C4B0"]
EMPTY_MSG = "No data yet — run the scheduler or check fixtures"

# Commission-cliff assumptions (illustrative slab model, NOT a live rate card):
CLIFF_PRICE = 1000.0
COMMISSION_BELOW = 0.08  # price <= ₹1,000
COMMISSION_ABOVE = 0.12  # price >  ₹1,000
REPOSITION_TARGET = 999.0
REPOSITION_BAND = (1000.0, 1150.0)  # SPEC PRC-03: cliff zone

DISCLAIMER = "Estimate only — verify current rate card in Seller Hub"


def _load_config() -> dict:
    for name in ("config.yaml", "config.example.yaml"):
        path = ROOT / name
        if path.exists():
            try:
                with open(path, encoding="utf-8") as fh:
                    data = yaml.safe_load(fh)
                return data if isinstance(data, dict) else {}
            except (OSError, yaml.YAMLError):
                return {}
    return {"mode": "fixture", "db_path": "fk_pulse.db"}


def _db() -> sqlite3.Connection:
    cfg = _load_config()
    raw = Path(str(cfg.get("db_path", "fk_pulse.db")))
    conn = sqlite3.connect(str(raw if raw.is_absolute() else ROOT / raw))
    conn.row_factory = sqlite3.Row
    return conn


def _df(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> pd.DataFrame:
    try:
        rows = conn.execute(sql, params).fetchall()
    except sqlite3.OperationalError:
        return pd.DataFrame()
    return pd.DataFrame([dict(r) for r in rows])


def _net_payout(price: float) -> float:
    """Estimated net payout under the slab assumption (excl. fixed fees/GST)."""
    rate = COMMISSION_ABOVE if price > CLIFF_PRICE else COMMISSION_BELOW
    return price * (1.0 - rate)


def _price_vs_median(conn: sqlite3.Connection) -> None:
    st.subheader("Price vs SERP median")
    med = _df(
        conn,
        """
        SELECT r.fsn, r.serp_median_price, r.keyword, r.fetched_at
        FROM rank_history r
        JOIN (SELECT fsn, MAX(fetched_at) AS mx FROM rank_history
              WHERE serp_median_price IS NOT NULL GROUP BY fsn) t
          ON r.fsn = t.fsn AND r.fetched_at = t.mx
        """,
    )
    listings = _df(conn, "SELECT fsn, title, price FROM listings")
    if med.empty or listings.empty:
        st.info(EMPTY_MSG)
        return
    df = listings.merge(med[["fsn", "serp_median_price"]], on="fsn", how="inner")
    if df.empty:
        st.info("No listings with SERP median data yet.")
        return
    thr = float((_load_config().get("thresholds", {}) or {}).get("price_vs_median_max", 1.05))
    df["ratio"] = df["price"] / df["serp_median_price"]
    df["vs_median_%"] = (df["ratio"] - 1.0) * 100
    df["flag"] = df["ratio"].apply(lambda x: "ABOVE LIMIT" if x > thr else "ok")
    df = df.sort_values("ratio", ascending=False)
    st.caption(f"Flags listings priced more than {thr - 1:.0%} above the SERP median (PVS risk).")
    st.dataframe(
        df[["fsn", "title", "price", "serp_median_price", "vs_median_%", "flag"]].rename(
            columns={
                "fsn": "FSN",
                "title": "Title",
                "price": "Price",
                "serp_median_price": "SERP median",
                "vs_median_%": "vs median %",
                "flag": "Flag",
            }
        ),
        width='stretch',
        hide_index=True,
        column_config={
            "Price": st.column_config.NumberColumn(format="₹%.0f"),
            "SERP median": st.column_config.NumberColumn(format="₹%.0f"),
            "vs median %": st.column_config.NumberColumn(format="%.1f%%"),
        },
    )
    fig = px.bar(
        df.sort_values("title"),
        x="title",
        y=["price", "serp_median_price"],
        barmode="group",
        color_discrete_sequence=PALETTE,
        labels={"title": "", "value": "₹", "variable": ""},
    )
    fig.update_layout(margin=dict(t=30))
    st.plotly_chart(fig, width='stretch')


def _cliff_calculator() -> None:
    st.subheader("Commission-cliff advisor")
    st.caption(
        f"Assumptions: commission {COMMISSION_BELOW:.0%} at or below ₹{CLIFF_PRICE:,.0f}, "
        f"{COMMISSION_ABOVE:.0%} above it; excludes fixed/collection/shipping fees and GST."
    )
    price = st.number_input(
        "Selling price (₹)", min_value=0.0, value=1099.0, step=10.0, format="%.2f"
    )
    if price <= 0:
        return
    net = _net_payout(price)
    rate = COMMISSION_ABOVE if price > CLIFF_PRICE else COMMISSION_BELOW
    c1, c2, c3 = st.columns(3)
    c1.metric("Assumed commission", f"{rate:.0%}")
    c2.metric("Estimated net payout", f"₹{net:,.2f}")
    c3.metric("Slab", f"above ₹{CLIFF_PRICE:,.0f}" if price > CLIFF_PRICE else f"≤ ₹{CLIFF_PRICE:,.0f}")

    if REPOSITION_BAND[0] < price <= REPOSITION_BAND[1]:
        net_999 = _net_payout(REPOSITION_TARGET)
        gain = net_999 - net
        if gain > 0:
            st.warning(
                f"Commission cliff: at ₹{price:,.0f} you net ₹{net:,.2f}, but at "
                f"₹{REPOSITION_TARGET:,.0f} you would net ₹{net_999:,.2f} "
                f"(+₹{gain:,.2f}/unit). Consider ₹999 repositioning (Rule PRC-03)."
            )
        else:
            st.info(
                f"Net at ₹{REPOSITION_TARGET:,.0f} would be ₹{net_999:,.2f} — no cliff gain here."
            )
    elif price > CLIFF_PRICE:
        net_999 = _net_payout(REPOSITION_TARGET)
        st.caption(f"Reference: net at ₹{REPOSITION_TARGET:,.0f} = ₹{net_999:,.2f}.")
    st.caption(DISCLAIMER)


def main() -> None:
    st.title("Pricing & Fees")
    conn = _db()
    try:
        _price_vs_median(conn)
    finally:
        conn.close()
    st.divider()
    _cliff_calculator()


main()
