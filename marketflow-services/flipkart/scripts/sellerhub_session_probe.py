"""Measure how long a Flipkart Seller Hub login lasts, and whether re-launching the browser ends it.

Opens the dedicated profile in a visible window, waits for YOU to sign in, then checks the session on a schedule:
  - "continuous" checks reload the dashboard in the same open window;
  - one "relaunch" check closes the browser and re-opens the same profile headless (what the scheduler does).
Every result is appended to sellerhub-session-probe.log. Stops at the first lost session or after 90 minutes.

    python scripts/sellerhub_session_probe.py
"""
from __future__ import annotations

import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fkpulse import sellerhub as sh  # noqa: E402

PROFILE = ROOT / "sellerhub-profile"
LOG = ROOT / "sellerhub-session-probe.log"
CHECKS_MIN = [3, 6, 10, "relaunch", 15, 20, 30, 45, 60, 75, 90]
SIGNIN_WAIT_MIN = 15


def log(msg: str) -> None:
    line = f"{datetime.now():%H:%M:%S}  {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def signed_in(page) -> bool:
    page.goto(sh.URL_HOME, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(6_000)
    return (not sh._is_landing(page)) and "index.html" in page.url


def wait_for_signin(page) -> bool:
    page.goto("https://seller.flipkart.com/", wait_until="domcontentloaded", timeout=60_000)
    end = time.time() + SIGNIN_WAIT_MIN * 60
    while time.time() < end:
        time.sleep(4)
        try:
            page = page.context.pages[-1]
            body = page.inner_text("body").lower()
            if "index.html" in page.url and "start selling" not in body and "referral_url" not in page.url and sum(m in body for m in ("listings", "orders", "payments")) >= 2:
                return True
        except Exception:  # noqa: BLE001
            continue
    return False


def main() -> int:
    from playwright.sync_api import sync_playwright

    LOG.write_text("", encoding="utf-8")
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(str(PROFILE), headless=False, viewport={"width": 1300, "height": 850})
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        log("waiting for you to sign in to Seller Hub in the open window...")
        if not wait_for_signin(page):
            log("NO SIGN-IN within 15 minutes - probe cancelled")
            ctx.close()
            return 1
        t0 = time.time()
        log("SIGNED IN (t=0)")
        for step in CHECKS_MIN:
            target = t0 + (12 * 60 if step == "relaunch" else step * 60)
            time.sleep(max(0, target - time.time()))
            elapsed = (time.time() - t0) / 60
            try:
                if step == "relaunch":
                    ctx.close()
                    c2 = pw.chromium.launch_persistent_context(str(PROFILE), headless=True)
                    ok = signed_in(c2.pages[0] if c2.pages else c2.new_page())
                    c2.close()
                    log(f"t+{elapsed:4.1f} min  RELAUNCH (new headless browser, same profile): {'still signed in' if ok else 'SESSION LOST'}")
                    ctx = pw.chromium.launch_persistent_context(str(PROFILE), headless=False, viewport={"width": 1300, "height": 850})
                    page = ctx.pages[0] if ctx.pages else ctx.new_page()
                    if not ok:
                        break
                else:
                    ok = signed_in(page)
                    log(f"t+{elapsed:4.1f} min  continuous window: {'still signed in' if ok else 'SESSION LOST'}")
                    if not ok:
                        break
            except Exception as exc:  # noqa: BLE001
                log(f"t+{elapsed:4.1f} min  check error: {str(exc).splitlines()[0][:120]}")
        log("probe finished")
        try:
            ctx.close()
        except Exception:  # noqa: BLE001
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
