"""Sync-health states — the situation that went unnoticed for six days must now read as an error."""
import json
from datetime import datetime, timedelta

from fkpulse.health import explain_error, sync_status

NOW = datetime(2026, 9, 25, 14, 0, 0)


def iso(**delta):
    return (NOW - timedelta(**delta)).isoformat()


def test_recent_sync_is_ok():
    s = sync_status(iso(minutes=20), None, 30, NOW)
    assert s["state"] == "ok"


def test_vault_password_failure_is_loud_and_says_how_to_fix_it():
    # exactly what the scheduler logged 200+ times: 6 days of silent failure
    err = json.dumps({"error": "FKPULSE_VAULT_PASSWORD env var not set; required to unlock the vault for unattended live-mode sync."})
    s = sync_status(iso(days=6), err, 30, NOW)
    assert s["state"] == "failing"
    assert "6.0 days ago" in s["message"]
    assert "set_credentials.py" in s["message"]


def test_failure_wins_even_when_the_last_success_was_recent():
    err = json.dumps({"error": "boom"})
    assert sync_status(iso(minutes=10), err, 30, NOW)["state"] == "failing"


def test_no_failure_recorded_but_long_silence_is_stale():
    s = sync_status(iso(hours=9), None, 30, NOW)
    assert s["state"] == "stale"
    assert "scheduler is probably not running" in s["message"]


def test_a_couple_of_missed_runs_is_not_yet_an_alarm():
    assert sync_status(iso(minutes=90), None, 30, NOW)["state"] == "ok"


def test_never_synced():
    assert sync_status(None, None, 30, NOW)["state"] == "never"


def test_wrong_password_and_rejected_credentials_have_distinct_advice():
    assert "can't be recovered" in explain_error("Could not decrypt vault entry: wrong master password or corrupted vault file.")
    assert "rejected the credentials" in explain_error("401 Client Error: Unauthorized for url")
    assert "missing from the vault" in explain_error("Live mode requires fk_app_id and fk_app_secret in the vault")


def test_unparseable_last_sync_does_not_crash():
    assert sync_status("not-a-date", None, 30, NOW)["state"] == "never"
