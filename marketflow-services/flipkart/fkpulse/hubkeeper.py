"""The Seller Hub window that stays open — how Flipkart Robo keeps its Flipkart login.

What was measured (2026-09-25): the saved login cookie lasts ~2 days, but Flipkart ends the login on ITS side after only
a couple of minutes without activity. Every earlier "the login died in 20-30 minutes" was that. A window that is used
every minute stays signed in (see scripts/sellerhub_lifetime_probe.py), so this keeps ONE browser window open and
touches it every ``KEEP_EVERY_S`` seconds, like a person with the dashboard open in a tab.

    * runs inside the Flipkart Robo process, in its own thread
    * the window is visible (minimised): when Flipkart does end the login, YOU sign in right there in that window —
      no script to run — and the keeper notices, reads Seller Hub straight away, and carries on
    * while signed out it never reloads the page (that would wipe what you are typing); it only watches
    * reads Seller Hub itself every ``read_minutes`` inside the same window, so unattended reads work
    * records how long each login lasted, so the real limit becomes known

The decision logic is a pure class (``KeeperLogic``) so it is tested without a browser.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

KEEP_EVERY_S = 45            # touch the dashboard this often while signed in (Flipkart's idle limit is a couple of minutes)
WATCH_EVERY_S = 5            # while signed out: just look at the window, never reload it
HEARTBEAT_RUN_EVERY_MIN = 10  # write an "ok" line to the run log this often (the robot's overdue check needs it)


class KeeperLogic:
    """State machine: signed in or not, when the last read was, what to record. Pure — no browser, no clock of its own."""

    def __init__(self, read_minutes: float):
        self.read_minutes = read_minutes
        self.signed_in = False
        self.session_started: Optional[datetime] = None
        self.last_read: Optional[datetime] = None
        self.last_heartbeat_run: Optional[datetime] = None

    def observe(self, alive: bool, now: datetime) -> dict:
        """Feed what the window shows. Returns {"event": started|continues|ended|still_out, "lifetime_minutes", "read_now", "record_ok"}."""
        out = {"event": "still_out", "lifetime_minutes": None, "read_now": False, "record_ok": False}
        if alive:
            if not self.signed_in:
                self.signed_in, self.session_started = True, now
                out["event"] = "started"
                out["read_now"] = True                       # fresh login: read everything at once
                self.last_heartbeat_run = now
                out["record_ok"] = True
            else:
                out["event"] = "continues"
                if self.last_read is None or (now - self.last_read) >= timedelta(minutes=self.read_minutes):
                    out["read_now"] = True
                if self.last_heartbeat_run is None or (now - self.last_heartbeat_run) >= timedelta(minutes=HEARTBEAT_RUN_EVERY_MIN):
                    self.last_heartbeat_run = now
                    out["record_ok"] = True
        else:
            if self.signed_in:
                out["event"] = "ended"
                if self.session_started:
                    out["lifetime_minutes"] = (now - self.session_started).total_seconds() / 60
                self.signed_in, self.session_started = False, None
        return out

    def read_done(self, now: datetime) -> None:
        self.last_read = now

    def sleep_seconds(self) -> int:
        return KEEP_EVERY_S if self.signed_in else WATCH_EVERY_S


def lifetime_text(minutes: Optional[float]) -> str:
    if minutes is None:
        return "Flipkart ended the Seller Hub login."
    if minutes >= 60:
        return f"Flipkart ended the Seller Hub login after {minutes / 60:.1f} hours."
    return f"Flipkart ended the Seller Hub login after {minutes:.0f} minutes."


def _log(name: str):
    from fkpulse.scheduler import _log as log
    return log(name)


def _kv(db_path: str, key: str, value: Optional[str]) -> None:
    from fkpulse.scheduler import _set_kv
    _set_kv(db_path, key, value)


class HubKeeper(threading.Thread):
    def __init__(self, config: dict, db_path: str):
        super().__init__(name="hub-keeper", daemon=True)
        self.config, self.db_path = config, db_path
        hub = config.get("sellerhub", {}) or {}
        self.profile = Path(hub.get("profile_dir", "sellerhub-profile"))
        if not self.profile.is_absolute():
            self.profile = Path(__file__).resolve().parents[1] / self.profile
        self.logic = KeeperLogic(read_minutes=float(hub.get("minutes", 180)))
        self._halt = threading.Event()

    def stop(self) -> None:
        self._halt.set()

    # ---------------------------------------------------------------- outer loop: never dies
    def run(self) -> None:
        from fkpulse.scheduler import _log
        log = _log("hub_keeper")
        log.info("hub_keeper_started")
        while not self._halt.is_set():
            try:
                self._one_browser()
            except Exception as exc:  # noqa: BLE001 — a crashed/closed window must not end the keeper
                log.error("hub_keeper_browser_ended", error=str(exc)[:200])
                self._record("hub_keepalive", datetime.now(), "failed", f"The Seller Hub window closed or crashed ({str(exc)[:120]}); reopening.")
                self._halt.wait(20)     # back off before reopening after a crash
            self.logic.signed_in, self.logic.session_started = False, None
            self._halt.wait(2)

    # ---------------------------------------------------------------- one browser window's lifetime
    def _one_browser(self) -> None:
        from playwright.sync_api import sync_playwright

        from fkpulse import sellerhub as sh
        from fkpulse.hublock import HubBusy, hub_lock

        try:
            lock = hub_lock(wait_s=0)
            lock.__enter__()
        except HubBusy:
            self._halt.wait(3)      # another job (or a probe) has the browser; retry very soon so a live login is not left idle
            return
        try:
            with sync_playwright() as pw:
                ctx = pw.chromium.launch_persistent_context(
                    str(self.profile), headless=False, viewport={"width": 1400, "height": 900}, args=["--start-minimized"])
                try:
                    _log("hub_keeper").info("keeper_window_open")
                    page = ctx.pages[0] if ctx.pages else ctx.new_page()
                    page.goto(sh.URL_HOME, wait_until="domcontentloaded", timeout=60_000)
                    page.wait_for_timeout(5_000)
                    self._loop(ctx, page)
                finally:
                    ctx.close()
        finally:
            lock.__exit__(None, None, None)

    def _alive(self, page, reload: bool) -> bool:
        """Is the window signed in? ``reload`` = load the dashboard afresh (activity); otherwise just look at what is there."""
        from fkpulse import sellerhub as sh
        if reload:
            page.goto(sh.URL_HOME, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(4_000)
        if sh._is_landing(page) or "index.html" not in (page.url or ""):
            return False
        body = page.inner_text("body").lower()      # the dashboard's left menu; the sign-in / OTP pages do not have it
        return "start selling" not in body and sum(m in body for m in ("listings", "orders", "payments")) >= 2

    def _loop(self, ctx, page) -> None:
        from fkpulse import sellerhub as sh
        prompted = False
        while not self._halt.is_set():
            now = datetime.now()
            alive = self._alive(page, reload=self.logic.signed_in)
            if page.is_closed():
                raise RuntimeError("the Seller Hub window was closed")
            ev = self.logic.observe(alive, now)
            _log("hub_keeper").info("keeper_check", signed_in=alive, what=ev["event"])
            if ev["event"] == "started":
                _kv(self.db_path, "sellerhub_session_started", now.isoformat(timespec="seconds"))
                _kv(self.db_path, "sellerhub_error", None)
                prompted = False
            if alive:
                _kv(self.db_path, "sellerhub_session_seen", now.isoformat(timespec="seconds"))
                if ev["record_ok"]:
                    mins = (now - self.logic.session_started).total_seconds() / 60 if self.logic.session_started else 0
                    self._record("hub_keepalive", now, "ok", f"Signed in and kept alive for {mins / 60:.1f} h" if mins >= 60 else f"Signed in and kept alive for {mins:.0f} min")
                if ev["read_now"]:
                    self._read(ctx, sh)
                    page = ctx.pages[0] if ctx.pages else ctx.new_page()
                    self.logic.read_done(datetime.now())
            else:
                if ev["event"] == "ended":
                    text = lifetime_text(ev["lifetime_minutes"]) + " Sign in again in the Seller Hub window that is open on this laptop."
                    _kv(self.db_path, "sellerhub_session_started", None)
                    if ev["lifetime_minutes"] is not None:
                        _kv(self.db_path, "sellerhub_last_lifetime_minutes", f"{ev['lifetime_minutes']:.0f}")
                    _kv(self.db_path, "sellerhub_error", json.dumps({"at": now.isoformat(), "kind": "session", "error": text}))
                    self._record("hub_keepalive", now, "needs_you", text)
                    prompted = False
                if not prompted:
                    if ev["event"] == "still_out":
                        msg = "Not signed in to Seller Hub. Sign in in the Seller Hub window that is open on this laptop (password / OTP); it stays signed in afterwards."
                        _kv(self.db_path, "sellerhub_error", json.dumps({"at": now.isoformat(), "kind": "session", "error": msg}))
                        self._record("hub_keepalive", now, "needs_you", msg)
                    try:  # show the sign-in page once (never again while signed out: reloading would wipe what is being typed)
                        page.goto("https://seller.flipkart.com/", wait_until="domcontentloaded", timeout=60_000)
                        page.bring_to_front()
                    except Exception:  # noqa: BLE001
                        pass
                    prompted = True
            self._halt.wait(self.logic.sleep_seconds())

    # ---------------------------------------------------------------- a full read inside the open window
    def _read(self, ctx, sh) -> None:
        from fkpulse import scheduler
        started = datetime.now()
        try:
            results = sh.read_in_open_browser(ctx, self.db_path)
            status, detail = scheduler.finish_hub_read(self.config, self.db_path, results)
        except sh.SessionExpired:
            return    # the next look at the window will notice and report it
        except Exception as exc:  # noqa: BLE001
            status, detail = "failed", str(exc)[:300]
        self._record("hub_read", started, status, detail)

    def _record(self, job: str, started: datetime, status: str, detail: str) -> None:
        from fkpulse import robot
        robot.record_run(self.db_path, job, started, status, detail)
        robot.publish_state(self.config, self.db_path)
