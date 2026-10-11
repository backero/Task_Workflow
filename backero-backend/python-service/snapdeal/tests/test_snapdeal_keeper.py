"""SnapdealKeeper's pure state machine (KeeperLogic) - no browser, no clock of its own.

Why this exists: a freshly-saved Snapdeal session was measured to go stale within ~2 minutes of the interactive
sign-in browser closing (see app/connectors/snapdeal_keeper.py's module docstring) - the same shape as the bug
already found and fixed for Meesho and Flipkart. The keeper's job is to never let the browser close while signed
in, so the session it exports to snapdeal_session.json is always fresh.
"""
from datetime import datetime, timedelta

from app.connectors.snapdeal_keeper import KeeperLogic, _looks_signed_in, lifetime_text

NOW = datetime(2026, 9, 26, 12, 0, 0)


def test_first_sign_in_is_reported_as_started():
    logic = KeeperLogic()
    ev = logic.observe(True, NOW)
    assert ev["event"] == "started"
    assert logic.signed_in is True and logic.session_started == NOW


def test_staying_signed_in_is_continues_not_started_again():
    logic = KeeperLogic()
    logic.observe(True, NOW)
    ev = logic.observe(True, NOW + timedelta(minutes=5))
    assert ev["event"] == "continues"


def test_going_signed_out_reports_the_session_lifetime():
    logic = KeeperLogic()
    logic.observe(True, NOW)
    ended = logic.observe(False, NOW + timedelta(minutes=2))
    assert ended["event"] == "ended" and ended["lifetime_minutes"] == 2
    assert logic.signed_in is False and logic.session_started is None


def test_remaining_signed_out_is_still_out():
    logic = KeeperLogic()
    still_out = logic.observe(False, NOW)
    assert still_out == {"event": "still_out", "lifetime_minutes": None}


def test_sleep_seconds_is_shorter_while_watching_for_sign_in():
    logic = KeeperLogic()
    assert logic.sleep_seconds() == 5
    logic.observe(True, NOW)
    assert logic.sleep_seconds() == 45


def test_lifetime_text_handles_minutes_hours_and_unknown():
    assert "2 minutes" in lifetime_text(2)
    assert "1.5 hours" in lifetime_text(90)
    assert lifetime_text(None) == "Snapdeal ended the Seller Panel login."


class FakePage:
    def __init__(self, url, body):
        self.url = url
        self._body = body

    def inner_text(self, *_a):
        return self._body


def test_looks_signed_in_true_on_the_real_dashboard_captured_2026_09_26():
    page = FakePage("https://seller.snapdeal.com/#/dashboard",
                     "Dashboard Orders Catalog Returns Payments Reports Advertise LOGOUT Hi BACKERO PRIVATE LIMITED!")
    assert _looks_signed_in(page) is True


def test_looks_signed_in_false_on_the_landing_page():
    page = FakePage("https://seller.snapdeal.com/",
                     "Start Selling on Snapdeal at - 0% Commission*. Enter Mobile No.")
    assert _looks_signed_in(page) is False


def test_looks_signed_in_does_not_reject_a_hidden_password_field():
    """The real dashboard keeps an input[type=password] somewhere in the DOM (a change-password form) - the
    detector must not use that as a signal, since it produced a false NOT_SIGNED_IN on a genuinely live session."""
    page = FakePage("https://seller.snapdeal.com/#/dashboard",
                     "Dashboard Orders Catalog Returns Payments LOGOUT")
    assert _looks_signed_in(page) is True
