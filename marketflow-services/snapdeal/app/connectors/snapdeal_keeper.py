"""The Seller Panel window that stays open — how Snapdeal Robo keeps its Snapdeal login.

Measured 2026-09-26: a freshly saved session (data/snapdeal_session.json, from a one-time interactive sign-in)
was confirmed still valid by one immediate re-check (BrowserConnector._check_login passed, scorecard synced ok),
then invalid again about 2 minutes later (a cold reload landed on the public marketing page instead of the
dashboard) - the same short server-side idle timeout already found and fixed for Meesho and Flipkart. A script
that signs in once, saves a snapshot, and closes cannot outrun that.

Fix, same shape as app/connector/meesho_keeper.py: keep ONE visible (minimised) browser window open continuously
on a persistent profile (data/snapdeal-profile), touch it every KEEP_EVERY_S seconds, and periodically re-export
its live cookies to data/snapdeal_session.json via ctx.storage_state(). BrowserConnector's existing fetch_* methods
are untouched - they still open their own short-lived context from that JSON file every sync, but now the file is
never more than a minute or two stale, so the cookies it hands them are always ones the server just saw used.

    * runs inside the FastAPI process (started from app/scheduler.py), in its own thread
    * the window is visible (minimised): sign in there directly - password / OTP / CAPTCHA, whatever Snapdeal
      asks - no separate script to run
    * while signed out it never reloads the page (that would wipe an OTP being typed); it only watches

The decision logic is a pure class (KeeperLogic) so it is tested without a browser.
"""
from __future__ import annotations

import os
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

KEEP_EVERY_S = 45          # touch the panel + re-export cookies this often while signed in
WATCH_EVERY_S = 5          # while signed out: just look at the window, never reload it

BASE = Path(__file__).resolve().parents[2]
PROFILE_DIR = Path(os.environ.get("SD_PROFILE_DIR", BASE / "data" / "snapdeal-profile"))
SESSION = Path(os.environ.get("SD_SESSION_FILE", BASE / "data" / "snapdeal_session.json"))
HOME = "https://seller.snapdeal.com"
EXPLORE_FLAG = BASE / "data" / "explore_requested"
READ_FLAG = BASE / "data" / "read_requested"
STEPS_FILE = BASE / "data" / "explore_steps.json"
READ_EVERY_MIN = 30        # read the panel this often while signed in
NAV_ITEMS = ["Orders", "Catalog", "Returns", "Payments", "Reports", "Advertise", "Performance 2.0"]


class KeeperLogic:
    """State machine: signed in or not. Pure - no browser, no clock of its own."""

    def __init__(self):
        self.signed_in = False
        self.session_started: Optional[datetime] = None

    def observe(self, alive: bool, now: datetime) -> dict:
        """Returns {"event": started|continues|ended|still_out, "lifetime_minutes"}."""
        out = {"event": "still_out", "lifetime_minutes": None}
        if alive:
            if not self.signed_in:
                self.signed_in, self.session_started = True, now
                out["event"] = "started"
            else:
                out["event"] = "continues"
        else:
            if self.signed_in:
                out["event"] = "ended"
                if self.session_started:
                    out["lifetime_minutes"] = (now - self.session_started).total_seconds() / 60
                self.signed_in, self.session_started = False, None
        return out

    def sleep_seconds(self) -> int:
        return KEEP_EVERY_S if self.signed_in else WATCH_EVERY_S


def lifetime_text(minutes: Optional[float]) -> str:
    if minutes is None:
        return "Snapdeal ended the Seller Panel login."
    if minutes >= 60:
        return f"Snapdeal ended the Seller Panel login after {minutes / 60:.1f} hours."
    return f"Snapdeal ended the Seller Panel login after {minutes:.0f} minutes."


def _looks_signed_in(page) -> bool:
    """Same URL + dashboard-word check as app/connectors/login.py's detector (NOT the password-field check -
    that false-positived on the real signed-in dashboard, see login.py's 2026-09-26 fix)."""
    url = (page.url or "").lower()
    if "login" in url or "signin" in url or "sign-in" in url:
        return False
    try:
        body = page.inner_text("body").lower()
    except Exception:  # noqa: BLE001
        return False
    off_landing = url.rstrip("/") != "https://seller.snapdeal.com"
    dashboard_words = sum(w in body for w in ("dashboard", "orders", "listings", "inventory", "logout", "sign out", "my account"))
    return off_landing and dashboard_words >= 2


class SnapdealKeeper(threading.Thread):
    def __init__(self, profile_dir: Optional[str] = None, session_path: Optional[str] = None):
        super().__init__(name="snapdeal-keeper", daemon=True)
        self.profile_dir = Path(profile_dir) if profile_dir else PROFILE_DIR
        self.session_path = Path(session_path) if session_path else SESSION
        self.logic = KeeperLogic()
        self.last_read: Optional[datetime] = None
        self._halt = threading.Event()
        self.last_error: Optional[str] = None
        self._retry_soon = False
        self._retries = 0

    def stop(self) -> None:
        self._halt.set()

    # ---------------------------------------------------------------- outer loop: never dies
    def run(self) -> None:
        while not self._halt.is_set():
            try:
                self._one_browser()
            except Exception as exc:  # noqa: BLE001 - a crashed/closed window must not end the keeper
                self.last_error = f"The Seller Panel window closed or crashed ({str(exc)[:120]}); reopening."
                self._halt.wait(20)
            self.logic.signed_in, self.logic.session_started = False, None
            self._halt.wait(2)

    # ---------------------------------------------------------------- one browser window's lifetime
    def _one_browser(self) -> None:
        from playwright.sync_api import sync_playwright

        from app.connectors.snapdeal_lock import ProfileBusy, profile_lock

        try:
            lock = profile_lock(wait_s=0)
            lock.__enter__()
        except ProfileBusy:
            self._halt.wait(3)      # a manual `login.py` run has the profile right now
            return
        try:
            with sync_playwright() as pw:
                ctx = pw.chromium.launch_persistent_context(
                    str(self.profile_dir), headless=False, viewport={"width": 1400, "height": 900})
                try:
                    self._restore_cookies(ctx)
                    page = ctx.pages[0] if ctx.pages else ctx.new_page()
                    page.goto(HOME, wait_until="domcontentloaded", timeout=60_000)
                    page.wait_for_timeout(4_000)
                    self._loop(ctx, page)
                finally:
                    ctx.close()
        finally:
            lock.__exit__(None, None, None)

    def _restore_cookies(self, ctx) -> None:
        """Chromium drops session-only cookies when the window closes, so a restart used to mean a new sign-in.
        The cookies exported every 45 s are put back (if the file is fresh); Snapdeal decides if they still count."""
        import json
        try:
            if self.session_path.exists() and (datetime.now().timestamp() - self.session_path.stat().st_mtime) < 6 * 3600:
                ctx.add_cookies(json.loads(self.session_path.read_text(encoding="utf-8")).get("cookies", []))
        except Exception:  # noqa: BLE001 - a bad file just means signing in by hand
            pass

    def _alive(self, page, reload: bool) -> bool:
        if reload:
            page.goto(HOME, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(4_000)
        return _looks_signed_in(page)

    def _explore(self, page) -> None:
        """Read-only: click each real nav item from the dashboard and save the page text + screenshot to
        capture-diagnostics/, so parsers can be built from real pages (the Meesho/Flipkart method). Triggered by
        creating data/explore_requested; the flag is removed when done."""
        out = BASE / "capture-diagnostics"
        out.mkdir(exist_ok=True)
        log = []
        for i, label in enumerate(["Dashboard"] + NAV_ITEMS, 1):
            try:
                page.goto(HOME + "/#/dashboard", wait_until="domcontentloaded", timeout=60_000)
                page.wait_for_timeout(4_000)
                if label != "Dashboard":
                    page.get_by_text(label, exact=True).first.click(timeout=8_000)
                    page.wait_for_timeout(6_000)
                name = f"live-{i:02d}-{label.lower().replace(' ', '-').replace('.', '')}"
                (out / f"{name}.txt").write_text(f"url: {page.url}\n\n{page.inner_text('body')}", encoding="utf-8")
                page.screenshot(path=str(out / f"{name}.png"), full_page=True)
                log.append(f"{name}: {page.url}")
            except Exception as exc:  # noqa: BLE001
                log.append(f"{label}: FAILED {str(exc).splitlines()[0][:120]}")
        (out / "live-explore.log").write_text("\n".join(log), encoding="utf-8")

    def _loop(self, ctx, page) -> None:
        prompted = False
        while not self._halt.is_set():
            now = datetime.now()
            if page.is_closed():
                raise RuntimeError("the Seller Panel window was closed")
            alive = self._alive(page, reload=self.logic.signed_in)
            ev = self.logic.observe(alive, now)
            if alive and STEPS_FILE.exists():
                import importlib, json

                from app.connectors import panel_reader
                importlib.reload(panel_reader)
                try:
                    panel_reader.explore(page, json.loads(STEPS_FILE.read_text(encoding="utf-8")))
                except Exception as exc:  # noqa: BLE001
                    self.last_error = f"explore failed: {exc}"
                finally:
                    STEPS_FILE.unlink(missing_ok=True)
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
            if alive and EXPLORE_FLAG.exists():
                try:
                    self._explore(page)
                finally:
                    EXPLORE_FLAG.unlink(missing_ok=True)
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
            force = alive and READ_FLAG.exists()
            if force:
                READ_FLAG.unlink(missing_ok=True)
            if alive and (force or self.last_read is None or (now - self.last_read) >= timedelta(minutes=READ_EVERY_MIN)):
                if self.last_read is None and not force:
                    # First read since this keeper (re)started: "alive" can go true the instant the persisted
                    # session is detected, before the freshly-launched window has fully settled - reading straight
                    # away made catalog/ads/notlive (separate URLs, one cross-domain) all fail together right after
                    # every restart, while mid-session reads on the same long-open window succeeded (found 2026-09-27).
                    self._halt.wait(8)
                self._read(page)
                self.last_read = datetime.now()
                if self._retry_soon and self._retries < 3:
                    # A partial/failed read (typically right after a restart, while the panel is still settling) is
                    # retried in ~3 minutes instead of waiting the full 30-minute cycle; capped so a permanently
                    # broken area cannot hammer the panel.
                    self._retries += 1
                    self.last_read = datetime.now() - timedelta(minutes=READ_EVERY_MIN - 3)
                else:
                    self._retries = 0
                self._retry_soon = False
            if alive:
                self.last_error = None
                try:
                    ctx.storage_state(path=str(self.session_path))
                except Exception as exc:  # noqa: BLE001 - a failed export must not kill the keeper
                    self.last_error = f"could not export session: {exc}"
                prompted = False
            else:
                if ev["event"] == "ended":
                    self.last_error = lifetime_text(ev["lifetime_minutes"]) + " Sign in again in the Seller Panel window that is open."
                    self._record("needs_you", self.last_error)
                    self.last_read = None
                    prompted = False
                if not prompted:
                    if ev["event"] == "still_out":
                        self.last_error = "Not signed in to the Snapdeal Seller Panel. Sign in in the window that is open (password / OTP / CAPTCHA); it stays signed in afterwards."
                        self._record("needs_you", self.last_error)
                    try:
                        page.goto(HOME, wait_until="domcontentloaded", timeout=60_000)
                        page.bring_to_front()
                    except Exception:  # noqa: BLE001
                        pass
                    prompted = True
            self._halt.wait(self.logic.sleep_seconds())

    # ---------------------------------------------------------------- a full read inside the open window
    def _read(self, page) -> None:
        import importlib

        from app.connectors import panel_reader
        importlib.reload(panel_reader)      # pick up reader fixes without restarting (a restart costs a sign-in)
        started = datetime.now().isoformat(timespec="seconds")
        try:
            results = panel_reader.read_in_open_page(page)
            failed = {k: v for k, v in results.items() if v != "ok"}
            if failed and len(failed) == len(results):
                status, detail = "failed", "; ".join(f"{k}: {v}" for k, v in failed.items())[:400]
            elif failed:
                status, detail = "partial", "Some areas failed: " + "; ".join(f"{k}: {v}" for k, v in failed.items())[:400]
            else:
                status, detail = "ok", f"Read {len(results)} areas: {', '.join(results)}."
        except Exception as exc:  # noqa: BLE001
            status, detail = "failed", f"{type(exc).__name__}: {exc}"[:300]
        self._retry_soon = status in ("partial", "failed")
        self._record(status, detail, started)
        if status in ("ok", "partial"):
            from app.scheduler import run_ai_analysis
            run_ai_analysis()

    def _record(self, status: str, detail: str, started: Optional[str] = None) -> None:
        from app import database as db
        db.record_run("panel_read", started or db.now(), status, detail)
