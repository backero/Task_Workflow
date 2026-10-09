"""Flipkart Robo page — is the background worker alive, what does each of its jobs do, and how did the last runs end?

Reads only what fkpulse.robot published (kv_config['robot_state'] + robot_runs); never touches Flipkart.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pandas as pd
import streamlit as st
import yaml

from fkpulse import robot

ROOT = Path(__file__).resolve().parents[3]
ICON = {"healthy": "🟢", "attention": "🟡", "needs_you": "🟠", "error": "🔴", "silent": "🔴", "never": "⚪"}
LABEL = {"healthy": "Healthy", "attention": "Working, but something was missed", "needs_you": "Needs you", "error": "Problem",
         "silent": "Not running", "never": "Never started"}
OUTCOME = {"ok": "✅ ok", "partial": "🟡 partial", "skipped": "⏭ skipped", "needs_you": "🟠 needs you", "failed": "🔴 failed"}


def _cfg() -> dict:
    for name in ("config.yaml", "config.example.yaml"):
        path = ROOT / name
        if path.exists():
            return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return {}


def _ago(iso: str | None) -> str:
    if not iso:
        return "never"
    from datetime import datetime
    try:
        m = (datetime.now() - datetime.fromisoformat(iso)).total_seconds() / 60
    except ValueError:
        return iso
    return "just now" if m < 1 else f"{int(m)} min ago" if m < 120 else f"{m / 60:.0f} h ago" if m < 2880 else f"{m / 1440:.0f} days ago"


cfg = _cfg()
raw = Path(str(cfg.get("db_path", "fk_pulse.db")))
db = str(raw if raw.is_absolute() else ROOT / raw)
view = robot.read_state(db)

st.title("Flipkart Robo")
st.caption("The always-on worker for Flipkart: it syncs the API, reads Seller Hub, scans search ranks and writes the daily recommendations.")
box = st.error if view["state"] in ("error", "silent") else st.warning if view["state"] in ("needs_you", "attention") else st.success if view["state"] == "healthy" else st.info
box(f"{ICON[view['state']]} **{LABEL[view['state']]}** — {view['message']}")
c1, c2, c3 = st.columns(3)
c1.metric("Last heartbeat", _ago(view.get("beat")))
c2.metric("Running since", (view.get("started_at") or "—").replace("T", " ")[:16])
c3.metric("Process id", view.get("pid") or "—")

st.subheader("What it does")
rows = []
for j in view["jobs"]:
    rows.append({
        "Job": j["label"], "What it does": j["what"],
        "Runs every": "off" if not j["enabled"] else f"{int(j['every_minutes'])} min" if j["every_minutes"] < 180 else f"{j['every_minutes'] / 60:g} h",
        "Last run": _ago(j["last_run"]), "Outcome": OUTCOME.get(j["last_status"], "—") + (" · OVERDUE" if j["overdue"] else ""),
        "Detail": j["detail"] or "",
    })
if rows:
    st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")

st.subheader("Recent runs")
try:
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    runs = pd.read_sql_query("SELECT finished_at AS finished, job, status, duration_s AS seconds, detail FROM robot_runs WHERE NOT (job = 'hub_keepalive' AND status IN ('ok', 'skipped')) ORDER BY id DESC LIMIT 40", conn)
    conn.close()
except (sqlite3.Error, pd.errors.DatabaseError):
    runs = pd.DataFrame()
if runs.empty:
    st.caption("No runs recorded yet.")
else:
    runs["job"] = runs["job"].map(lambda j: robot.JOBS.get(j, (j,))[0])
    runs["status"] = runs["status"].map(lambda s: OUTCOME.get(s, s))
    st.dataframe(runs, hide_index=True, width="stretch")
st.caption("Log file: `fkpulse.log` in the Flipkart folder. Windows task: 'FKPulse Scheduler'.")
