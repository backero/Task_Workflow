"""Sign in to Flipkart Seller Hub and read EVERYTHING in the same browser window, straight away.

Why one script: Flipkart ends a Seller Hub login quickly (a session lasted a full read, then was gone minutes later, and
did not survive separate browser launches). Reading in the same window right after you sign in is the reliable way to
get the data. You sign in by hand (password / OTP) - this script never sees your credentials.

    python scripts/sellerhub_login_and_read.py

Then it refreshes the recommendations, and prints how long the session lasted while it worked.
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fkpulse import robot  # noqa: E402
from fkpulse.hublock import HubBusy, hub_lock  # noqa: E402
from fkpulse import sellerhub as sh  # noqa: E402
from fkpulse.config import load_config  # noqa: E402
from fkpulse.scheduler import _set_kv, job_digest  # noqa: E402

PROFILE = ROOT / "sellerhub-profile"
WAIT_MINUTES = 15


def signed_in(page) -> bool:
    body = page.inner_text("body").lower()
    return ("index.html" in page.url and "referral_url" not in page.url and "start selling" not in body
            and sum(m in body for m in ("listings", "orders", "payments")) >= 2)


def main() -> int:
    from playwright.sync_api import sync_playwright

    try:
        with hub_lock(wait_s=90):   # the session keeper / scheduled read may be using the browser for a few seconds
            return _run(sync_playwright)
    except HubBusy:
        print("The Seller Hub browser is in use - normally by Flipkart Robo's own Seller Hub window. If Flipkart Robo is running, "
              "just sign in in THAT window (it is open on this laptop); no script is needed.", flush=True)
        return 1


def _run(sync_playwright) -> int:
    cfg = load_config()
    db = cfg.get("db_path", "fk_pulse.db")
    PROFILE.mkdir(exist_ok=True)
    started = datetime.now()
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(str(PROFILE), headless=False, viewport={"width": 1400, "height": 900})
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto("https://seller.flipkart.com/", wait_until="domcontentloaded", timeout=60_000)
            print("A Seller Hub window is open - please sign in (password / OTP). Waiting up to 15 minutes...", flush=True)
            end, ok = time.time() + WAIT_MINUTES * 60, False
            while time.time() < end and not ok:
                time.sleep(4)
                try:
                    ok = signed_in(ctx.pages[-1])
                except Exception:  # noqa: BLE001 - a page mid-navigation is normal while signing in
                    pass
            if not ok:
                print("NOT_SIGNED_IN - nothing read.", flush=True)
                robot.record_run(db, "hub_read", started, "needs_you", "Seller Hub sign-in was not completed, so nothing was read.")
                robot.publish_state(cfg, db, touch_beat=False)
                return 1
            t0 = time.time()
            _set_kv(db, "sellerhub_session_started", datetime.now().isoformat(timespec="seconds"))
            _set_kv(db, "sellerhub_error", None)
            print("SIGNED_IN - reading everything now, in this same window (please leave it open)...", flush=True)
            results = sh.read_in_open_browser(ctx, db)
            took = (time.time() - t0) / 60
            for area, res in results.items():
                print(f"  {area:16s} {res}", flush=True)
            # is the session still alive after the whole read? (this is the lifetime measurement)
            alive = None
            try:
                page = ctx.pages[0]
                page.goto(sh.URL_HOME, wait_until="domcontentloaded", timeout=60_000)
                page.wait_for_timeout(6_000)
                alive = not sh._is_landing(page)
            except Exception:  # noqa: BLE001
                pass
            print(f"read took {took:.1f} min; session still valid afterwards: {alive}", flush=True)
        finally:
            ctx.close()

    failed = {k: v for k, v in results.items() if v != "ok"}
    _set_kv(db, "sellerhub_error", json.dumps({"at": datetime.now().isoformat(), "kind": "partial",
            "error": "Some Seller Hub pages could not be read: " + "; ".join(f"{k} ({v})" for k, v in failed.items())}) if failed else None)
    _set_kv(db, "sellerhub_last_ok", datetime.now().isoformat())
    job_digest(cfg, db)
    # The manual sign-in-and-read is a run of the Flipkart Robo's Seller Hub job like any scheduled one.
    robot.record_run(db, "hub_read", started, "partial" if failed else "ok",
                     ("Read " + str(len(results) - len(failed)) + f" of {len(results)} Seller Hub areas; missed: " + ", ".join(failed)) if failed
                     else f"Read all {len(results)} Seller Hub areas (manual sign-in).")
    robot.publish_state(cfg, db, touch_beat=False)
    print("Recommendations refreshed. Done.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
