"""Measure how long a Seller Hub login really lasts while ONE window stays open and is used every 30 seconds.

Sign in once (you type the OTP). The window then stays open; every 30 s it reloads the dashboard and records whether
Flipkart still accepts the login, until it is refused or 25 minutes have passed. This separates the two theories:
  * "idle timeout"  -> constant activity keeps the login alive for the whole 25 minutes
  * "short fixed lifetime" -> it dies after a few minutes no matter what
Only key NAMES from storage are logged, never values. Results go to sellerhub-lifetime-probe.log.

    python scripts/sellerhub_lifetime_probe.py
"""
from __future__ import annotations

import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fkpulse import sellerhub as sh  # noqa: E402
from fkpulse.hublock import HubBusy, hub_lock  # noqa: E402

PROFILE = ROOT / "sellerhub-profile"
LOG = ROOT / "sellerhub-lifetime-probe.log"
CHECK_EVERY_S = 30
GIVE_UP_MIN = 25


def log(msg: str) -> None:
    line = f"{datetime.now():%H:%M:%S}  {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def signed_in_text(page) -> bool:
    body = page.inner_text("body").lower()
    return ("index.html" in page.url and "referral_url" not in page.url and "start selling" not in body
            and sum(m in body for m in ("listings", "orders", "payments")) >= 2)


def storage_names(page) -> str:
    try:
        return page.evaluate("() => JSON.stringify({local: Object.keys(localStorage), session: Object.keys(sessionStorage)})")
    except Exception:  # noqa: BLE001
        return "?"


def main() -> int:
    from playwright.sync_api import sync_playwright

    LOG.write_text("", encoding="utf-8")
    try:
        with hub_lock(wait_s=90):
            with sync_playwright() as pw:
                ctx = pw.chromium.launch_persistent_context(str(PROFILE), headless=False, viewport={"width": 1300, "height": 850})
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                page.goto("https://seller.flipkart.com/", wait_until="domcontentloaded", timeout=60_000)
                log("A Seller Hub window is open - please sign in (password / OTP), then LEAVE IT OPEN. Waiting up to 15 minutes...")
                end, ok = time.time() + 15 * 60, False
                while time.time() < end and not ok:
                    time.sleep(4)
                    try:
                        page = ctx.pages[-1]
                        ok = signed_in_text(page)
                    except Exception:  # noqa: BLE001
                        pass
                if not ok:
                    log("NOT_SIGNED_IN - nothing measured")
                    ctx.close()
                    return 1
                t0 = time.time()
                log(f"SIGNED IN (t=0). storage keys: {storage_names(page)}")
                while time.time() - t0 < GIVE_UP_MIN * 60:
                    time.sleep(CHECK_EVERY_S)
                    minutes = (time.time() - t0) / 60
                    try:
                        page.goto(sh.URL_HOME, wait_until="domcontentloaded", timeout=60_000)
                        page.wait_for_timeout(5_000)
                        alive = not sh._is_landing(page)
                        sid = next((c for c in ctx.cookies() if c["name"] == "connect.sid"), None)
                        left = f"{(sid['expires'] - time.time()) / 3600:.1f} h" if sid and sid["expires"] > 0 else "none"
                        log(f"t+{minutes:5.1f} min  {'still signed in' if alive else 'LOGGED OUT'}   connect.sid expiry left: {left}")
                        if not alive:
                            log(f"RESULT  login lasted about {minutes:.1f} minutes with the window open and used every {CHECK_EVERY_S} s. storage keys now: {storage_names(page)}")
                            break
                    except Exception as exc:  # noqa: BLE001
                        log(f"t+{minutes:5.1f} min  check error: {str(exc).splitlines()[0][:100]}")
                else:
                    log(f"RESULT  still signed in after {GIVE_UP_MIN} minutes of use - constant activity keeps the login alive")
                ctx.close()
    except HubBusy:
        print("The Seller Hub browser is busy with another job - try again in a minute.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
