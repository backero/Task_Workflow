"""Is the data on screen fresh, and if not, why? (pure logic — no I/O, easy to test)

The scheduler's API sync failed every 30 minutes for six days because its vault password was
unavailable, and the dashboard showed a grey "Last sync: 2026-09-19" the whole time — indistinguishable
from a healthy system. This turns that into an explicit state with a plain-language reason.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

# A sync is expected every ``api_minutes``; tolerate a few missed runs before shouting.
_MIN_STALE_HOURS = 2.0
_MISSED_RUNS = 4


def _parse(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso))
    except ValueError:
        return None


def explain_error(error: str) -> str:
    """Turn a raw scheduler error into the fix the operator actually needs."""
    e = error or ""
    if "FKPULSE_VAULT_PASSWORD" in e:
        return ("The background sync can't unlock the credential vault (its master password isn't available "
                "to the scheduler). Run `python scripts/set_credentials.py --persist-password` once to re-enter "
                "the Flipkart App ID/Secret and store the password where the scheduler can read it.")
    if "wrong master password" in e.lower() or "VaultPassword" in e:
        return ("The vault master password is wrong, and a vault can't be recovered without it. Re-register the app in "
                "Seller Hub and run `python scripts/set_credentials.py --persist-password`.")
    if "fk_app_id" in e or "fk_app_secret" in e or "LiveModeCredentials" in e:
        return "Flipkart App ID / Secret are missing from the vault — run `python scripts/set_credentials.py`."
    if "401" in e or "403" in e or "invalid_client" in e.lower():
        return "Flipkart rejected the credentials (revoked or rotated) — generate a new App ID/Secret in Seller Hub and re-enter them."
    return f"The last sync attempt failed: {e}"


def sync_status(last_sync_iso: Optional[str], last_error_json: Optional[str], api_minutes: int, now: Optional[datetime] = None) -> dict:
    """
    Returns ``{"state": "ok"|"stale"|"failing"|"never", "message": str, "age_hours": float|None}``.

    - ok       — synced recently and the last attempt didn't fail
    - failing  — the most recent attempt failed (message says why and how to fix it)
    - stale    — no failure recorded but no sync for far longer than the schedule allows (scheduler not running?)
    - never    — nothing has ever synced
    """
    now = now or datetime.now()
    last = _parse(last_sync_iso)
    age_h = (now - last).total_seconds() / 3600 if last else None

    err_text = None
    if last_error_json:
        try:
            err_text = json.loads(last_error_json).get("error")
        except (ValueError, AttributeError):
            err_text = str(last_error_json)

    if err_text:
        when = f"Last successful sync: {last.strftime('%d %b %H:%M')} ({age_h / 24:.1f} days ago). " if last and age_h and age_h >= 24 else (
            f"Last successful sync: {last.strftime('%d %b %H:%M')}. " if last else "It has never synced successfully. ")
        return {"state": "failing", "message": when + explain_error(err_text), "age_hours": age_h}

    if last is None:
        return {"state": "never", "message": "Nothing has synced yet. Start the scheduler (`python run_scheduler.py`).", "age_hours": None}

    limit_h = max(_MIN_STALE_HOURS, _MISSED_RUNS * api_minutes / 60)
    if age_h > limit_h:
        return {
            "state": "stale",
            "message": (f"No sync for {age_h:.0f} hours (expected every {api_minutes} minutes) — the scheduler is probably not running. "
                        "Start it with `python run_scheduler.py`, or register it to start at logon (scripts/windows_setup.md)."),
            "age_hours": age_h,
        }
    return {"state": "ok", "message": f"Synced {age_h * 60:.0f} minutes ago.", "age_hours": age_h}
