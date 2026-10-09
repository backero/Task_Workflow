"""Account Health page — KPI cards vs thresholds + 30d trends (SPEC UI).

Reads only metrics_snapshots (scope='account') and config thresholds.
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


# (key, label, threshold_key_or_const, threshold_fallback, higher_is_better, fmt)
_KPIS = [
    ("cancellation_rate_30d", "Cancellation rate (30d)", "cancellation_max", 0.0025, False, "{:.2%}"),
    ("rtd_breach_rate_30d", "RTD breach rate (30d)", "rtd_breach_max", 0.005, False, "{:.2%}"),
    ("rto_rate_30d", "RTO rate (30d)", None, 0.20, False, "{:.2%}"),
    ("rating_avg_weighted", "Rating (weighted)", "rating_min", 4.2, True, "{:.2f}"),
    ("settlement_lag_days_avg", "Settlement lag (days)", None, 12.0, False, "{:.1f}"),
    ("tacos_30d", "TACoS (30d)", None, 0.35, False, "{:.2%}"),
]


def _latest_metrics(conn: sqlite3.Connection) -> dict[str, float | None]:
    df = _df(
        conn,
        """
        SELECT m.key, m.value
        FROM metrics_snapshots m
        JOIN (SELECT key, MAX(computed_at) AS mx
              FROM metrics_snapshots WHERE scope = 'account' GROUP BY key) t
          ON m.key = t.key AND m.computed_at = t.mx
        WHERE m.scope = 'account'
        """,
    )
    if df.empty:
        return {}
    return {r["key"]: r["value"] for _, r in df.iterrows()}


def _kpi_cards(latest: dict[str, float | None], thresholds: dict) -> None:
    cols = st.columns(len(_KPIS))
    for col, (key, label, thr_key, thr_default, higher_ok, fmt) in zip(cols, _KPIS):
        thr = float(thresholds.get(thr_key, thr_default)) if thr_key else thr_default
        val = latest.get(key)
        with col:
            if val is None or (isinstance(val, float) and val != val):  # None or NaN → no data
                st.metric(label, "—")
                st.caption("no data (import ads CSV)" if key == "tacos_30d" else "no data")
                continue
            ok = (val >= thr) if higher_ok else (val <= thr)
            st.metric(label, fmt.format(val), delta=f"limit {fmt.format(thr)}", delta_color="off")
            st.markdown(":green[within threshold]" if ok else ":red[breach]")


def _trends(conn: sqlite3.Connection) -> None:
    df = _df(
        conn,
        "SELECT key, value, computed_at FROM metrics_snapshots "
        "WHERE scope = 'account' ORDER BY computed_at",
    )
    if df.empty:
        st.info(EMPTY_MSG)
        return
    df["computed_at"] = pd.to_datetime(df["computed_at"], errors="coerce")
    keys = sorted(df["key"].unique())
    sel = st.multiselect("Metrics", keys, default=keys[:1])
    if not sel:
        return
    fig = px.line(
        df[df["key"].isin(sel)],
        x="computed_at",
        y="value",
        color="key",
        markers=True,
        color_discrete_sequence=PALETTE,
        labels={"computed_at": "Computed at", "value": "Value", "key": "Metric"},
    )
    fig.update_layout(legend_title_text="", margin=dict(t=30))
    st.plotly_chart(fig, width='stretch')


def main() -> None:
    st.title("Account Health")
    conn = _db()
    try:
        latest = _latest_metrics(conn)
        if not latest:
            st.info(EMPTY_MSG)
        else:
            thresholds = _load_config().get("thresholds", {}) or {}
            _kpi_cards(latest, thresholds)
        st.subheader("Metric trends")
        _trends(conn)
    finally:
        conn.close()


main()
