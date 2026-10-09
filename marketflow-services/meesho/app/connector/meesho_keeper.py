"""The Supplier Panel window that stays open — how Meesho Robo keeps its Meesho login.

What was measured (2026-09-26): a fresh, valid sign-in was captured for 2.2 minutes inside one continuously-open
browser window (scripts/capture_supplier_panel.py) — but ~5 minutes after that window closed, relaunching a plain
headless read against the very same saved profile (data/session) came back signed out (panel_reader.SessionExpired).
Same shape as the Flipkart Seller Hub finding: Meesho ends the login on its side after a short spell of no activity,
and a script that opens the browser, reads once, and closes it cannot outrun that. The fix is also the same one used
for Flipkart (see ../../../flipkart/fkpulse/fkpulse/hubkeeper.py): keep ONE browser window open continuously and
touch it every ``KEEP_EVERY_S`` seconds, like a person with the Supplier Panel open in a tab.

    * runs inside the Meesho Flask process (started from start_scheduler), in its own thread
    * the window is visible (minimised): when Meesho does end the login, sign in right there in that window — no
      script to run — and the keeper notices, reads the panel straight away, and carries on
    * while signed out it never reloads the page (that would wipe an OTP being typed); it only watches
    * reads the 4 account-level areas (panel_reader.read_in_open_browser) inside the same window every
      ``read_minutes``, so unattended reads work
    * holds app/connector/panel_lock.py while it owns the browser, so the older catalog pull (pull_all) cannot
      launch a second Chromium against the same profile directory at the same time

The decision logic is a pure class (``KeeperLogic``) so it is tested without a browser.
"""
from __future__ import annotations

import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

STEPS_FILE = Path(__file__).resolve().parents[2] / "data" / "explore_steps.json"
READ_FLAG = Path(__file__).resolve().parents[2] / "data" / "read_requested"
KEEP_EVERY_S = 45          # touch the panel this often while signed in
WATCH_EVERY_S = 5          # while signed out: just look at the window, never reload it
READ_EVERY_MIN = 240       # read the 4 account-level areas this often while signed in (every 4h, owner's call - was 30 min)


class KeeperLogic:
    """State machine: signed in or not, when the last read was. Pure — no browser, no clock of its own."""

    def __init__(self, read_minutes: float = READ_EVERY_MIN):
        self.read_minutes = read_minutes
        self.signed_in = False
        self.session_started: Optional[datetime] = None
        self.last_read: Optional[datetime] = None

    def observe(self, alive: bool, now: datetime) -> dict:
        """Feed what the window shows. Returns {"event": started|continues|ended|still_out, "lifetime_minutes", "read_now"}."""
        out = {"event": "still_out", "lifetime_minutes": None, "read_now": False}
        if alive:
            if not self.signed_in:
                self.signed_in, self.session_started = True, now
                out["event"] = "started"
                out["read_now"] = True                        # fresh login: read everything at once
            else:
                out["event"] = "continues"
                if self.last_read is None or (now - self.last_read) >= timedelta(minutes=self.read_minutes):
                    out["read_now"] = True
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
        return "Meesho ended the Supplier Panel login."
    if minutes >= 60:
        return f"Meesho ended the Supplier Panel login after {minutes / 60:.1f} hours."
    return f"Meesho ended the Supplier Panel login after {minutes:.0f} minutes."


class MeeshoKeeper(threading.Thread):
    def __init__(self, db_path: str, session_dir: Optional[str] = None, read_minutes: float = READ_EVERY_MIN):
        super().__init__(name="meesho-keeper", daemon=True)
        self.db_path = db_path
        from app.connector.meesho_connector import SESSION_DIR
        self.session_dir = Path(session_dir or SESSION_DIR)
        if not self.session_dir.is_absolute():
            self.session_dir = Path(__file__).resolve().parents[2] / self.session_dir
        self.logic = KeeperLogic(read_minutes=read_minutes)
        self._halt = threading.Event()

    def stop(self) -> None:
        self._halt.set()

    # ---------------------------------------------------------------- outer loop: never dies
    def run(self) -> None:
        while not self._halt.is_set():
            try:
                self._one_browser()
            except Exception as exc:  # noqa: BLE001 - a crashed/closed window must not end the keeper
                self._record("panel_read", datetime.now(), "failed", f"The Supplier Panel window closed or crashed ({str(exc)[:120]}); reopening.")
                self._halt.wait(20)     # back off before reopening after a crash
            self.logic.signed_in, self.logic.session_started = False, None
            self._halt.wait(2)

    # ---------------------------------------------------------------- one browser window's lifetime
    def _one_browser(self) -> None:
        from playwright.sync_api import sync_playwright

        from app.connector.panel_lock import PanelBusy, panel_lock

        try:
            lock = panel_lock(wait_s=0)
            lock.__enter__()
        except PanelBusy:
            self._halt.wait(3)      # the catalog pull has the browser right now; retry very soon
            return
        try:
            with sync_playwright() as pw:
                ctx = pw.chromium.launch_persistent_context(
                    str(self.session_dir), headless=False, viewport={"width": 1400, "height": 900})
                try:
                    page = ctx.pages[0] if ctx.pages else ctx.new_page()
                    from app.connectors import panel_reader
                    page.goto(panel_reader.HOME, wait_until="domcontentloaded", timeout=60_000)
                    page.wait_for_timeout(5_000)
                    self._loop(ctx, page)
                finally:
                    ctx.close()
        finally:
            lock.__exit__(None, None, None)

    def _alive(self, page, reload: bool) -> bool:
        """Is the window signed in? ``reload`` = load the panel afresh (activity); otherwise just look at what is there."""
        from app.connectors import panel_reader
        if reload:
            page.goto(panel_reader.HOME, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(4_000)
        return panel_reader._signed_in(page)

    def _loop(self, ctx, page) -> None:
        from app.connectors import panel_reader
        prompted = False
        while not self._halt.is_set():
            now = datetime.now()
            if page.is_closed():
                raise RuntimeError("the Supplier Panel window was closed")
            alive = self._alive(page, reload=self.logic.signed_in)
            ev = self.logic.observe(alive, now)
            if alive and STEPS_FILE.exists():
                import importlib
                import json
                importlib.reload(panel_reader)
                try:
                    panel_reader.explore(page, json.loads(STEPS_FILE.read_text(encoding="utf-8")))
                except Exception:  # noqa: BLE001
                    pass
                finally:
                    STEPS_FILE.unlink(missing_ok=True)
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
            force = alive and READ_FLAG.exists()
            if force:
                READ_FLAG.unlink(missing_ok=True)
            if alive:
                if ev["read_now"] or force:
                    import importlib
                    importlib.reload(panel_reader)      # pick up reader fixes without a restart
                    self._read(ctx, panel_reader)
                    page = ctx.pages[0] if ctx.pages else ctx.new_page()
                    self.logic.read_done(datetime.now())
                prompted = False
            else:
                if ev["event"] == "ended":
                    self._record("panel_read", now, "needs_you",
                                 lifetime_text(ev["lifetime_minutes"]) + " Sign in again in the Supplier Panel window that is open.")
                    prompted = False
                if not prompted:
                    if ev["event"] == "still_out":
                        self._record("panel_read", now, "needs_you",
                                     "Not signed in to the Meesho Supplier Panel. Sign in in the window that is open (mobile OTP); it stays signed in afterwards.")
                    try:  # show the sign-in page once (never again while signed out: reloading would wipe an OTP being typed)
                        page.goto(panel_reader.HOME, wait_until="domcontentloaded", timeout=60_000)
                        page.bring_to_front()
                    except Exception:  # noqa: BLE001
                        pass
                    prompted = True
            self._halt.wait(self.logic.sleep_seconds())

    # ---------------------------------------------------------------- a full read inside the open window
    def _read(self, ctx, panel_reader) -> None:
        started = datetime.now()
        try:
            results = panel_reader.read_in_open_browser(ctx, self.db_path)
            failed = {k: v for k, v in results.items() if v != "ok"}
            if not results:
                status, detail = "failed", "No areas were read."
            elif failed and len(failed) == len(results):
                status, detail = "failed", "; ".join(f"{k}: {v}" for k, v in failed.items())[:400]
            elif failed:
                status, detail = "partial", "Some areas failed: " + "; ".join(f"{k}: {v}" for k, v in failed.items())[:400]
            else:
                status, detail = "ok", f"Read {len(results)} areas: {', '.join(results)}."
        except panel_reader.SessionExpired:
            return    # the next look at the window will notice and report it
        except Exception as exc:  # noqa: BLE001
            status, detail = "failed", str(exc)[:300]
        self._record("panel_read", started, status, detail)
        if status in ("ok", "partial"):
            from app.scheduler import recompute_now
            recompute_now(self.db_path)

    def _record(self, job: str, started: datetime, status: str, detail: str) -> None:
        from app import robot
        from app.database import get_conn
        conn = get_conn(self.db_path)
        try:
            robot.record_run(conn, job, started, status, detail)
        finally:
            conn.close()
