"""Recommendations page — filterable, expandable, mark-done (SPEC UI).

Each row shows rule_id + rationale_ref. The SPEC schema has no rationale_ref
column, so rule_id -> rationale_ref is resolved from the frozen rule list
(SPEC §recommend) via _RATIONALE.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pandas as pd
import streamlit as st
import yaml

ROOT = Path(__file__).resolve().parents[3]
EMPTY_MSG = "No data yet — run the scheduler or check fixtures"

# rule_id -> rationale_ref (research report chapter), from SPEC §recommend.
_RATIONALE = {
    "LQS-01": "Research report Ch.2 — Listing Quality Score: attribute completeness",
    "LQS-02": "Research report Ch.2 — Listing Quality Score: image count >= 3",
    "RAT-01": "Research report Ch.7 — rating average threshold (4.2)",
    "RAT-02": "Research report Ch.7 — review velocity / review gap",
    "STK-01": "Research report Ch.1/5 — stock cover vs rank decay",
    "PRC-02": "Research report Ch.5 — Price Value Score vs SERP median",
    "PRC-03": "Research report Ch.5 — commission cliff at Rs.1,000",
    "OPS-01": "Research report Ch.5 — cancellation rate <= 0.25%",
    "OPS-02": "Research report Ch.5 — RTD breach <= 0.5%",
    "RTO-01": "Research report Ch.5 — RTO rate thresholds (account 20% / FSN 25%)",
    "SET-01": "Research report Ch.5 — settlement lag > 12 days",
    "ADS-01": "Research report Ch.3/7 — TACoS threshold / CPC cold-start",
    "EVT-01": "Research report Ch.3 — BBD deal nomination (T-8 weeks)",
    "EVT-02": "Research report Ch.3/6 — Usual Price 15-day rule",
    "KWD-01": "Research report Ch.1/2 — title keyword coverage",
    "RNK-01": "Research report Ch.1/3 — search-rank visibility decay",
}

_SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


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


def _filters(df: pd.DataFrame) -> pd.DataFrame:
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        sev = st.multiselect(
            "Severity",
            sorted(df["severity"].dropna().unique(),
                   key=lambda s: _SEVERITY_ORDER.get(str(s).lower(), 9)),
            default=None,
            placeholder="all",
        )
    with c2:
        status = st.selectbox("Status", ["open", "done", "all"], index=0)
    with c3:
        scopes = st.multiselect("Scope", sorted(df["scope"].dropna().unique()),
                                default=None, placeholder="all")
    with c4:
        rules = st.multiselect("Rule", sorted(df["rule_id"].dropna().unique()),
                               default=None, placeholder="all")
    out = df
    if sev:
        out = out[out["severity"].isin(sev)]
    if status != "all":
        out = out[out["status"] == status]
    if scopes:
        out = out[out["scope"].isin(scopes)]
    if rules:
        out = out[out["rule_id"].isin(rules)]
    return out


def _mark_done(conn: sqlite3.Connection, rec_id: int) -> None:
    conn.execute("UPDATE recommendations SET status = 'done' WHERE id = ?", (rec_id,))
    conn.commit()


def _ai_section(conn: sqlite3.Connection) -> None:
    """The AI strategist's latest read (fkpulse/ai_analysis.py) - reasoning over the real numbers above, grounded
    in Flipkart's own marketplace research doc, not a new source of numbers. Runs after every real Seller Hub read."""
    st.subheader("AI strategic analysis")
    try:
        row = conn.execute(
            "SELECT ts, summary FROM ai_insights ORDER BY id DESC LIMIT 1").fetchone()
    except sqlite3.OperationalError:
        row = None
    if not row:
        st.caption("No analysis yet — it runs after the next real Seller Hub read (needs ANTHROPIC_API_KEY set).")
        return
    st.caption(f"Claude's read on the real numbers, as of {row['ts']}.")
    st.markdown(row["summary"])
    st.divider()


def main() -> None:
    st.title("Recommendations")
    conn = _db()
    try:
        _ai_section(conn)
        df = _df(
            conn,
            "SELECT id, scope, fsn, rule_id, severity, title, detail, status, created_at "
            "FROM recommendations ORDER BY created_at DESC",
        )
        if df.empty:
            st.info(EMPTY_MSG)
            return

        open_df = df[df["status"] == "open"]
        if not open_df.empty:
            counts = open_df["severity"].value_counts()
            cols = st.columns(len(counts))
            for col, (sev, n) in zip(cols, counts.items()):
                col.metric(f"Open · {sev}", int(n))

        view = _filters(df)
        if view.empty:
            st.info("No recommendations match the current filters.")
            return
        st.caption(f"{len(view)} recommendation(s)")

        for _, r in view.iterrows():
            label = f"[{r['severity'] or '?'}] {r['title'] or '(untitled)'}"
            if r["status"] != "open":
                label += "  (done)"
            with st.expander(label):
                st.markdown(f"**Rule:** `{r['rule_id'] or '—'}`")
                st.markdown(
                    f"**Rationale:** {_RATIONALE.get(str(r['rule_id']), '—')}"
                )
                st.markdown(f"**Scope:** `{r['scope'] or '—'}`"
                            + (f"  ·  **FSN:** `{r['fsn']}`" if r["fsn"] else ""))
                st.markdown(f"**Created:** {r['created_at'] or '—'}")
                if r["detail"]:
                    st.markdown(r["detail"])
                if r["status"] == "open":
                    if st.button("Mark done", key=f"done_{r['id']}"):
                        try:
                            _mark_done(conn, int(r["id"]))
                            st.rerun()
                        except sqlite3.Error as exc:
                            st.error(f"Could not update: {exc}")
    finally:
        conn.close()


main()
