"""Calendar page — event countdowns (BBD / Diwali) + Usual Price 15-day windows.

Rule dates (SPEC): Big Billion Days ~Sep 22; Diwali sale ~Oct 20.
"""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import streamlit as st
import yaml

ROOT = Path(__file__).resolve().parents[3]
EMPTY_MSG = "No data yet — run the scheduler or check fixtures"

# (name, month, day) — rule dates per SPEC §recommend (EVT-01).
EVENTS = [("Big Billion Days", 9, 22), ("Diwali sale", 10, 20)]
USUAL_PRICE_DAYS = 15
DEAL_NOMINATION_LEAD_DAYS = 56  # 8 weeks before BBD (EVT-01)


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


def _next_event(month: int, day: int, today: date) -> date:
    d = date(today.year, month, day)
    return d if d >= today else date(today.year + 1, month, day)


def _countdowns(today: date) -> None:
    st.subheader("Sale event countdowns")
    cols = st.columns(len(EVENTS))
    for col, (name, month, day) in zip(cols, EVENTS):
        nxt = _next_event(month, day, today)
        days = (nxt - today).days
        with col:
            st.metric(name, f"{days} days", delta=nxt.isoformat(), delta_color="off")
    bbd = _next_event(9, 22, today)
    days_to_bbd = (bbd - today).days
    if 0 < days_to_bbd <= DEAL_NOMINATION_LEAD_DAYS:
        st.warning(
            f"Big Billion Days in {days_to_bbd} days — submit deal nominations now "
            "(T-8 weeks window, Rule EVT-01)."
        )
    diwali = _next_event(10, 20, today)
    days_to_diwali = (diwali - today).days
    if 0 < days_to_diwali <= DEAL_NOMINATION_LEAD_DAYS:
        st.warning(
            f"Diwali sale in {days_to_diwali} days — plan event inventory and deals "
            "(Rule EVT-01)."
        )


def _usual_price(conn: sqlite3.Connection, today: date) -> None:
    st.subheader("Usual Price 15-day windows")
    st.caption(
        f"Listings must hold their 'usual price' for {USUAL_PRICE_DAYS} days after listing "
        "before promotions; ads only during the window (Rule EVT-02)."
    )
    df = _df(
        conn,
        "SELECT fsn, title, price, listed_date FROM listings "
        "WHERE listed_date IS NOT NULL AND listed_date != '' ORDER BY listed_date DESC",
    )
    if df.empty:
        st.info(EMPTY_MSG)
        return

    rows = []
    for _, r in df.iterrows():
        try:
            listed = date.fromisoformat(str(r["listed_date"])[:10])
        except ValueError:
            continue
        window_end = listed + timedelta(days=USUAL_PRICE_DAYS)
        age = (today - listed).days
        open_now = age < USUAL_PRICE_DAYS
        rows.append(
            {
                "FSN": r["fsn"],
                "Title": r["title"],
                "Price": r["price"],
                "Listed": listed.isoformat(),
                "Window ends": window_end.isoformat(),
                "Day": min(age + 1, USUAL_PRICE_DAYS),
                "Status": "OPEN — no promotions" if open_now else "closed",
            }
        )
    if not rows:
        st.info("No parseable listed_date values.")
        return
    out = pd.DataFrame(rows)
    recent = out[out["Status"].str.startswith("OPEN")]
    if not recent.empty:
        st.warning(
            f"{len(recent)} listing(s) inside the 15-day Usual Price window — "
            "no promotions until day 15; ads only (Rule EVT-02)."
        )
    else:
        st.success("No listings inside the 15-day Usual Price window.")
    st.dataframe(out, width='stretch', hide_index=True)


def main() -> None:
    st.title("Calendar")
    today = date.today()
    _countdowns(today)
    st.divider()
    conn = _db()
    try:
        _usual_price(conn, today)
    finally:
        conn.close()


main()
