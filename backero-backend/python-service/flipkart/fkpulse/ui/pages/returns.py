"""Returns / RTO page — RTO by SKU, pincode clusters, COD vs prepaid split.

Reads returns + orders only (SPEC UI).
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


def _rto_by_sku(conn: sqlite3.Connection) -> None:
    st.subheader("RTO by SKU")
    df = _df(
        conn,
        """
        SELECT o.fsn, COALESCE(l.title, o.fsn) AS title,
               COUNT(DISTINCT o.order_id) AS orders,
               SUM(CASE WHEN r.type = 'COURIER_RTO' THEN 1 ELSE 0 END) AS rto
        FROM orders o
        LEFT JOIN returns r ON r.order_id = o.order_id
        LEFT JOIN listings l ON l.fsn = o.fsn
        GROUP BY o.fsn
        ORDER BY rto DESC
        """,
    )
    if df.empty:
        st.info(EMPTY_MSG)
        return
    df["rto_rate"] = df["rto"] / df["orders"]
    df["rto_rate_pct"] = df["rto_rate"] * 100
    st.dataframe(
        df[["fsn", "title", "orders", "rto", "rto_rate_pct"]].rename(
            columns={"fsn": "FSN", "title": "Title", "orders": "Orders",
                     "rto": "RTO count", "rto_rate_pct": "RTO rate"}
        ),
        width='stretch',
        hide_index=True,
        column_config={"RTO rate": st.column_config.NumberColumn(format="%.1f%%")},
    )
    fig = px.bar(
        df, x="title", y="rto_rate", color_discrete_sequence=PALETTE,
        labels={"title": "", "rto_rate": "RTO rate"},
    )
    fig.update_layout(margin=dict(t=30))
    st.plotly_chart(fig, width='stretch')


def _rto_by_pincode(conn: sqlite3.Connection) -> None:
    st.subheader("RTO pincode clusters")
    df = _df(
        conn,
        """
        SELECT o.pincode, COUNT(*) AS rto_count
        FROM returns r JOIN orders o ON o.order_id = r.order_id
        WHERE r.type = 'COURIER_RTO' AND o.pincode IS NOT NULL AND o.pincode != ''
        GROUP BY o.pincode ORDER BY rto_count DESC LIMIT 10
        """,
    )
    if df.empty:
        st.info("No RTO returns recorded yet.")
        return
    fig = px.bar(
        df, x="pincode", y="rto_count", color_discrete_sequence=PALETTE,
        labels={"pincode": "Pincode", "rto_count": "RTO returns"},
    )
    fig.update_layout(margin=dict(t=30))
    st.plotly_chart(fig, width='stretch')
    st.dataframe(df.rename(columns={"pincode": "Pincode", "rto_count": "RTO returns"}),
                 width='stretch', hide_index=True)


def _cod_split(conn: sqlite3.Connection) -> None:
    st.subheader("COD vs prepaid")
    df = _df(
        conn,
        """
        SELECT COALESCE(o.payment_type, 'UNKNOWN') AS payment_type,
               COUNT(DISTINCT o.order_id) AS orders,
               SUM(CASE WHEN r.type = 'COURIER_RTO' THEN 1 ELSE 0 END) AS rto
        FROM orders o
        LEFT JOIN returns r ON r.order_id = o.order_id
        GROUP BY payment_type
        """,
    )
    if df.empty:
        st.info(EMPTY_MSG)
        return
    df["rto_rate"] = df["rto"] / df["orders"]
    df["rto_rate_pct"] = df["rto_rate"] * 100
    c1, c2 = st.columns(2)
    with c1:
        fig = px.pie(
            df, names="payment_type", values="orders",
            color_discrete_sequence=PALETTE, title="Orders by payment type",
        )
        fig.update_layout(margin=dict(t=40))
        st.plotly_chart(fig, width='stretch')
    with c2:
        fig = px.bar(
            df, x="payment_type", y="rto_rate", color_discrete_sequence=PALETTE,
            title="RTO rate by payment type",
            labels={"payment_type": "Payment type", "rto_rate": "RTO rate"},
        )
        fig.update_layout(margin=dict(t=40))
        st.plotly_chart(fig, width='stretch')
    st.dataframe(
        df[["payment_type", "orders", "rto", "rto_rate_pct"]].rename(
            columns={"payment_type": "Payment type", "orders": "Orders",
                     "rto": "RTO count", "rto_rate_pct": "RTO rate"}
        ),
        width='stretch',
        hide_index=True,
        column_config={"RTO rate": st.column_config.NumberColumn(format="%.1f%%")},
    )


def main() -> None:
    st.title("Returns / RTO")
    conn = _db()
    try:
        _rto_by_sku(conn)
        st.divider()
        _rto_by_pincode(conn)
        st.divider()
        _cod_split(conn)
    finally:
        conn.close()


main()
