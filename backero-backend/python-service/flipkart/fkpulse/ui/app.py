"""FK-Pulse Streamlit dashboard entrypoint (multipage via st.navigation).

Reads ONLY from the SQLite DB (SPEC schema) and config.yaml — never calls APIs.
Renders the shared top banner (mode + last sync) above every page.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import streamlit as st
import yaml

ROOT = Path(__file__).resolve().parents[2]
DB_DEFAULT = "fk_pulse.db"

st.set_page_config(page_title="FK-Pulse", layout="wide")


def _load_config() -> dict:
    """Read config.yaml, falling back to config.example.yaml (SPEC Config).

    Deliberately does NOT import fkpulse.config — the UI only needs mode/db_path.
    """
    for name in ("config.yaml", "config.example.yaml"):
        path = ROOT / name
        if path.exists():
            try:
                with open(path, encoding="utf-8") as fh:
                    data = yaml.safe_load(fh)
                return data if isinstance(data, dict) else {}
            except (OSError, yaml.YAMLError):
                return {}
    return {"mode": "fixture", "db_path": DB_DEFAULT}


def _db_path(cfg: dict) -> str:
    raw = Path(str(cfg.get("db_path", DB_DEFAULT)))
    return str(raw if raw.is_absolute() else ROOT / raw)


def _kv(db_path: str, key: str) -> str | None:
    if not Path(db_path).exists():
        return None
    try:
        conn = sqlite3.connect(db_path)
        try:
            row = conn.execute("SELECT value FROM kv_config WHERE key = ?", (key,)).fetchone()
            return str(row[0]) if row else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def _banner() -> None:
    cfg = _load_config()
    mode = str(cfg.get("mode", "fixture"))
    db = _db_path(cfg)
    last_sync = _kv(db, "last_sync")
    hub_ok = _kv(db, "sellerhub_last_ok")
    st.caption(f"Mode: `{mode}`  ·  Seller Hub last read: {hub_ok[:16].replace('T', ' ') if hub_ok else 'never'}  ·  "
               f"Flipkart API last sync: {last_sync[:16].replace('T', ' ') if last_sync else 'never'}")
    if mode == "fixture":
        st.warning("DEMO DATA — fixture mode")
        return
    # Live mode: say plainly when the numbers below are not fresh, and why. A failing sync used to look
    # exactly like a healthy one (grey timestamp) — it ran dead for six days unnoticed.
    from fkpulse.health import sync_status
    status = sync_status(last_sync, _kv(db, "last_sync_error"), int((cfg.get("polling") or {}).get("api_minutes", 30)))
    from fkpulse import robot
    robo = robot.read_state(db)
    if robo["state"] in ("silent", "never"):
        st.error(f"**{robo['name']} is not running.** {robo['message']}")
    if status["state"] in ("failing", "stale", "never"):
        from datetime import datetime as _dt
        hub_age_h = None
        if hub_ok:
            try:
                hub_age_h = (_dt.now() - _dt.fromisoformat(hub_ok)).total_seconds() / 3600
            except ValueError:
                pass
        if hub_age_h is not None and hub_age_h < 6:
            # Seller Hub is being read, so listings, health, traffic and ads ARE current; only the API data is missing.
            st.warning(f"**Flipkart API sync is not running, so orders, returns, settlements and per-order detail are not updating.** "
                       f"{status['message']}  Listings, account health, traffic and ads are current from Seller Hub "
                       f"(read {hub_age_h * 60:.0f} minutes ago).")
        else:
            st.error(f"**Flipkart data is not being updated.** {status['message']}")

    # Seller Hub reader: a lapsed login is expected now and then (Flipkart ends sessions server-side) — say so.
    hub_err = _kv(db, "sellerhub_error")
    if hub_err:
        import json
        try:
            info = json.loads(hub_err)
        except ValueError:
            info = {"error": hub_err}
        last_ok = _kv(db, "sellerhub_last_ok")
        st.warning(f"**Seller Hub numbers may be out of date.** {info.get('error', '')}"
                   + (f" Last successful read: {last_ok[:16].replace('T', ' ')}." if last_ok else ""))


_PAGES = [
    st.Page("pages/robot.py", title="Flipkart Robo"),
    st.Page("pages/account.py", title="Account Health"),
    st.Page("pages/sellerhub.py", title="Seller Hub"),
    st.Page("pages/listings.py", title="Listings"),
    st.Page("pages/rank.py", title="Rank Tracker"),
    st.Page("pages/pricing.py", title="Pricing & Fees"),
    st.Page("pages/returns.py", title="Returns / RTO"),
    st.Page("pages/calendar.py", title="Calendar"),
    st.Page("pages/recommendations.py", title="Recommendations"),
]


def main() -> None:
    _banner()
    nav = st.navigation(_PAGES)
    nav.run()


main()
