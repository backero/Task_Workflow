"""Listings page — sortable table + per-FSN drilldown (SPEC UI).

Drilldown: KPI panel, attribute gaps, rank history chart, open recommendations.
"""
from __future__ import annotations

import json
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


def _attr_stats(row: pd.Series) -> tuple[int, int | None, float | None]:
    """Return (filled, total, completeness) from attributes_json/attributes_total."""
    try:
        attrs = json.loads(row.get("attributes_json") or "{}")
    except (TypeError, json.JSONDecodeError):
        attrs = {}
    filled = sum(1 for v in attrs.values() if v not in (None, "", []))
    total = row.get("attributes_total")
    total = int(total) if pd.notna(total) else None
    completeness = (filled / total) if total else None
    return filled, total, completeness


def _listings_table(conn: sqlite3.Connection) -> pd.DataFrame:
    df = _df(conn, "SELECT * FROM listings ORDER BY title")
    if df.empty:
        return df
    best_rank = _df(conn, "SELECT fsn, MIN(position) AS best_rank FROM rank_history GROUP BY fsn")
    open_recs = _df(
        conn,
        "SELECT fsn, COUNT(*) AS open_recs FROM recommendations "
        "WHERE status = 'open' AND fsn IS NOT NULL GROUP BY fsn",
    )
    comp = df.apply(lambda r: _attr_stats(r)[2], axis=1)
    df["attr_completeness"] = comp * 100  # percent for display
    if not best_rank.empty:
        df = df.merge(best_rank, on="fsn", how="left")
    else:
        df["best_rank"] = None
    if not open_recs.empty:
        df = df.merge(open_recs, on="fsn", how="left")
    else:
        df["open_recs"] = 0
    df["open_recs"] = df["open_recs"].fillna(0).astype(int)
    return df


def _drilldown(conn: sqlite3.Connection, fsn: str) -> None:
    row = _df(conn, "SELECT * FROM listings WHERE fsn = ?", (fsn,))
    if row.empty:
        st.info("Listing not found.")
        return
    r = row.iloc[0]
    st.subheader(f"{r.get('title') or fsn}")
    st.caption(f"FSN `{fsn}` · SKU `{r.get('sku') or '—'}` · status `{r.get('status') or '—'}`")

    # Per-FSN KPI panel (latest snapshot per key).
    kpis = _df(
        conn,
        """
        SELECT m.key, m.value FROM metrics_snapshots m
        JOIN (SELECT key, MAX(computed_at) AS mx FROM metrics_snapshots
              WHERE scope = ? GROUP BY key) t
          ON m.key = t.key AND m.computed_at = t.mx
        WHERE m.scope = ?
        """,
        (f"fsn:{fsn}", f"fsn:{fsn}"),
    )
    if kpis.empty:
        st.info("No KPI snapshots for this listing yet.")
    else:
        cols = st.columns(min(4, len(kpis)))
        for i, k in kpis.iterrows():
            with cols[i % len(cols)]:
                val = k["value"]
                st.metric(k["key"], "—" if (val is None or (isinstance(val, float) and val != val)) else f"{val:.3g}")

    # Attribute gaps.
    st.markdown("**Attributes**")
    filled, total, completeness = _attr_stats(r)
    try:
        attrs = json.loads(r.get("attributes_json") or "{}")
    except (TypeError, json.JSONDecodeError):
        attrs = {}
    if total:
        st.write(f"Completeness: {filled}/{total} filled ({completeness:.0%})")
        missing = total - filled
        if missing > 0:
            st.write(f":red[{missing} attribute(s) missing]")
    if attrs:
        st.dataframe(
            pd.DataFrame({"attribute": list(attrs), "value": [attrs[k] for k in attrs]}),
            width='stretch',
            hide_index=True,
        )
    else:
        st.caption("No attribute data stored.")

    # Rank history chart.
    st.markdown("**Rank history**")
    rh = _df(
        conn,
        "SELECT keyword, position, page, fetched_at FROM rank_history "
        "WHERE fsn = ? ORDER BY fetched_at",
        (fsn,),
    )
    if rh.empty:
        st.info("No rank history for this listing yet.")
    else:
        rh["fetched_at"] = pd.to_datetime(rh["fetched_at"], errors="coerce")
        fig = px.line(
            rh,
            x="fetched_at",
            y="position",
            color="keyword",
            markers=True,
            color_discrete_sequence=PALETTE,
            labels={"fetched_at": "Fetched at", "position": "Position", "keyword": "Keyword"},
        )
        fig.update_yaxes(autorange="reversed", title="Position (1 = top)")
        fig.update_layout(legend_title_text="", margin=dict(t=30))
        st.plotly_chart(fig, width='stretch')

    # Open recommendations for this FSN.
    st.markdown("**Open recommendations**")
    recs = _df(
        conn,
        "SELECT severity, rule_id, title, detail, created_at FROM recommendations "
        "WHERE fsn = ? AND status = 'open' ORDER BY created_at DESC",
        (fsn,),
    )
    if recs.empty:
        st.info("No open recommendations for this listing.")
    else:
        st.dataframe(recs, width='stretch', hide_index=True)


def main() -> None:
    st.title("Listings")
    conn = _db()
    try:
        df = _listings_table(conn)
        if df.empty:
            st.info(EMPTY_MSG)
            return
        show = df[
            ["fsn", "title", "price", "stock", "rating_avg", "attr_completeness", "best_rank", "open_recs"]
        ].rename(
            columns={
                "fsn": "FSN",
                "title": "Title",
                "price": "Price",
                "stock": "Stock",
                "rating_avg": "Rating",
                "attr_completeness": "Attr. completeness",
                "best_rank": "Best rank",
                "open_recs": "Open recs",
            }
        )
        st.dataframe(
            show,
            width='stretch',
            hide_index=True,
            column_config={
                "Attr. completeness": st.column_config.ProgressColumn(
                    "Attr. completeness", min_value=0, max_value=100, format="%.0f%%"
                ),
                "Price": st.column_config.NumberColumn(format="₹%.0f"),
            },
        )
        st.divider()
        fsn = st.selectbox(
            "Drill down into a listing",
            df["fsn"].tolist(),
            format_func=lambda f: f"{f} — {df.loc[df['fsn'] == f, 'title'].iloc[0]}",
        )
        if fsn:
            _drilldown(conn, fsn)
    finally:
        conn.close()


main()
