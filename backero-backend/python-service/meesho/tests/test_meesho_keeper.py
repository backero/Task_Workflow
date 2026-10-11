"""MeeshoKeeper's pure state machine (KeeperLogic) - no browser, no clock of its own.

Why this exists: a fresh Meesho sign-in was measured to go stale within ~5 minutes of the browser that signed in
closing (see app/connector/meesho_keeper.py's module docstring). The keeper's job is to never let the browser close
while signed in, and to read the account-level panel on a schedule from inside that one long-lived window.
"""
from datetime import datetime, timedelta

from app.connector.meesho_keeper import KeeperLogic, lifetime_text

NOW = datetime(2026, 9, 26, 12, 0, 0)


def test_first_sign_in_triggers_an_immediate_read():
    logic = KeeperLogic(read_minutes=30)
    ev = logic.observe(True, NOW)
    assert ev["event"] == "started" and ev["read_now"] is True
    assert logic.signed_in is True and logic.session_started == NOW


def test_staying_signed_in_does_not_read_again_until_the_interval_elapses():
    logic = KeeperLogic(read_minutes=30)
    logic.observe(True, NOW)
    logic.read_done(NOW)
    soon = logic.observe(True, NOW + timedelta(minutes=5))
    assert soon["event"] == "continues" and soon["read_now"] is False
    due = logic.observe(True, NOW + timedelta(minutes=31))
    assert due["event"] == "continues" and due["read_now"] is True


def test_going_signed_out_reports_the_session_lifetime():
    logic = KeeperLogic(read_minutes=30)
    logic.observe(True, NOW)
    ended = logic.observe(False, NOW + timedelta(minutes=12))
    assert ended["event"] == "ended" and ended["lifetime_minutes"] == 12
    assert logic.signed_in is False and logic.session_started is None


def test_remaining_signed_out_is_reported_once_as_still_out():
    logic = KeeperLogic(read_minutes=30)
    still_out = logic.observe(False, NOW)
    assert still_out == {"event": "still_out", "lifetime_minutes": None, "read_now": False}


def test_sleep_seconds_is_shorter_while_watching_for_sign_in():
    logic = KeeperLogic()
    assert logic.sleep_seconds() == 5
    logic.observe(True, NOW)
    assert logic.sleep_seconds() == 45


def test_lifetime_text_handles_minutes_hours_and_unknown():
    assert "12 minutes" in lifetime_text(12)
    assert "2.0 hours" in lifetime_text(120)
    assert lifetime_text(None) == "Meesho ended the Supplier Panel login."
