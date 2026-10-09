"""Rank Tracker page — keyword x position history + tracked-keyword management.

Writes (add/remove) go to tracked_keywords only; reads rank_history.
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


def _manage_keywords(conn: sqlite3.Connection) -> None:
    st.subheader("Tracked keywords")
    tracked = _df(
        conn,
        "SELECT id, fsn, keyword FROM tracked_keywords WHERE active = 1 ORDER BY fsn, keyword",
    )
    if tracked.empty:
        st.info("No tracked keywords yet — add one below.")
    else:
        st.dataframe(tracked[["fsn", "keyword"]], width='stretch', hide_index=True)

    listings = _df(conn, "SELECT fsn, title FROM listings ORDER BY title")
    with st.form("add_keyword", clear_on_submit=True):
        st.markdown("**Add keyword**")
        if listings.empty:
            fsn = st.text_input("FSN")
        else:
            fsn = st.selectbox(
                "Listing",
                listings["fsn"].tolist(),
                format_func=lambda f: f"{f} — "
                f"{listings.loc[listings['fsn'] == f, 'title'].iloc[0]}",
            )
        keyword = st.text_input("Keyword")
        if st.form_submit_button("Track keyword"):
            kw = keyword.strip()
            if not fsn or not kw:
                st.error("FSN and keyword are required.")
            else:
                try:
                    existing = conn.execute(
                        "SELECT id, active FROM tracked_keywords WHERE fsn = ? AND keyword = ?",
                        (fsn, kw),
                    ).fetchone()
                    if existing is None:
                        conn.execute(
                            "INSERT INTO tracked_keywords(fsn, keyword, active) VALUES (?, ?, 1)",
                            (fsn, kw),
                        )
                    elif existing["active"] != 1:
                        conn.execute(
                            "UPDATE tracked_keywords SET active = 1 WHERE id = ?",
                            (existing["id"],),
                        )
                    conn.commit()
                    st.success(f"Now tracking “{kw}” for {fsn}.")
                    st.rerun()
                except sqlite3.Error as exc:
                    st.error(f"Could not save keyword: {exc}")

    if not tracked.empty:
        with st.form("remove_keyword"):
            st.markdown("**Remove keyword**")
            opts = {
                int(r["id"]): f"{r['fsn']} — {r['keyword']}" for _, r in tracked.iterrows()
            }
            rid = st.selectbox(
                "Tracked keyword", list(opts), format_func=lambda i: opts[i]
            )
            if st.form_submit_button("Stop tracking"):
                try:
                    conn.execute("UPDATE tracked_keywords SET active = 0 WHERE id = ?", (rid,))
                    conn.commit()
                    st.success(f"Stopped tracking {opts[rid]}.")
                    st.rerun()
                except sqlite3.Error as exc:
                    st.error(f"Could not remove keyword: {exc}")


def _history(conn: sqlite3.Connection) -> None:
    st.subheader("Rank history")
    df = _df(
        conn,
        "SELECT fsn, keyword, position, page, serp_median_price, fetched_at "
        "FROM rank_history ORDER BY fetched_at",
    )
    if df.empty:
        st.info(EMPTY_MSG)
        return
    df["fetched_at"] = pd.to_datetime(df["fetched_at"], errors="coerce")
    df["series"] = df["keyword"] + " · " + df["fsn"].astype(str)

    keywords = sorted(df["keyword"].unique())
    sel = st.multiselect("Keywords", keywords, default=keywords)
    if not sel:
        return
    view = df[df["keyword"].isin(sel)]

    fig = px.line(
        view,
        x="fetched_at",
        y="position",
        color="series",
        markers=True,
        color_discrete_sequence=PALETTE,
        labels={"fetched_at": "Fetched at", "position": "Position", "series": "Keyword · FSN"},
    )
    fig.update_yaxes(autorange="reversed", title="Position (1 = top)")
    fig.update_layout(legend_title_text="", margin=dict(t=30))
    st.plotly_chart(fig, width='stretch')

    st.markdown("**Latest position per keyword**")
    latest = _df(
        conn,
        """
        SELECT r.fsn, r.keyword, r.position, r.page, r.serp_median_price, r.fetched_at
        FROM rank_history r
        JOIN (SELECT fsn, keyword, MAX(fetched_at) AS mx
              FROM rank_history GROUP BY fsn, keyword) t
          ON r.fsn = t.fsn AND r.keyword = t.keyword AND r.fetched_at = t.mx
        ORDER BY r.keyword, r.position
        """,
    )
    st.dataframe(latest, width='stretch', hide_index=True)


def main() -> None:
    st.title("Rank Tracker")
    conn = _db()
    try:
        _history(conn)
        st.divider()
        _manage_keywords(conn)
    finally:
        conn.close()


main()
