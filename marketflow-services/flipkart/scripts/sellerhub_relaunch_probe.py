"""Find out WHICH kind of browser relaunch keeps a Seller Hub login alive.

Known so far: the login cookie is saved for ~2 days, the login survives inside the window you signed in with, but a
fresh headless launch of the same profile a few seconds after closing it is logged out. This signs in once (you type the
OTP) and then tries, one after another, with the same profile:

    A  a fresh VISIBLE browser
    B  a fresh headless browser that presents the normal Chrome user-agent (no "HeadlessChrome")
    C  a fresh headless browser exactly as the scheduler launches it today

and prints which of them are still signed in. Results are appended to sellerhub-relaunch-probe.log.

    python scripts/sellerhub_relaunch_probe.py
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
LOG = ROOT / "sellerhub-relaunch-probe.log"


def log(msg: str) -> None:
    line = f"{datetime.now():%H:%M:%S}  {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def signed_in_text(page) -> bool:
    body = page.inner_text("body").lower()
    return ("index.html" in page.url and "referral_url" not in page.url and "start selling" not in body
            and sum(m in body for m in ("listings", "orders", "payments")) >= 2)


def check(pw, label: str, headless: bool, user_agent: str | None = None, args: list[str] | None = None) -> bool:
    kwargs = {"headless": headless, "viewport": {"width": 1400, "height": 900}}
    if user_agent:
        kwargs["user_agent"] = user_agent
    if args:
        kwargs["args"] = args
    ctx = pw.chromium.launch_persistent_context(str(PROFILE), **kwargs)
    try:
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(sh.URL_HOME, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(7_000)
        ok = not sh._is_landing(page)
        log(f"  {label:58s} -> {'STILL SIGNED IN' if ok else 'logged out'}")
        return ok
    finally:
        ctx.close()
        time.sleep(3)


def main() -> int:
    from playwright.sync_api import sync_playwright

    LOG.write_text("", encoding="utf-8")
    try:
        with hub_lock(wait_s=90):
            with sync_playwright() as pw:
                ctx = pw.chromium.launch_persistent_context(str(PROFILE), headless=False, viewport={"width": 1300, "height": 850})
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                page.goto("https://seller.flipkart.com/", wait_until="domcontentloaded", timeout=60_000)
                ua = page.evaluate("navigator.userAgent")
                log("A Seller Hub window is open - please sign in (password / OTP). Waiting up to 15 minutes...")
                end, ok = time.time() + 15 * 60, False
                while time.time() < end and not ok:
                    time.sleep(4)
                    try:
                        ok = signed_in_text(ctx.pages[-1])
                    except Exception:  # noqa: BLE001
                        pass
                if not ok:
                    log("NOT_SIGNED_IN - nothing tested")
                    ctx.close()
                    return 1
                log(f"SIGNED IN. Visible browser user-agent: {ua[:90]}")
                page.wait_for_timeout(4_000)
                ctx.close()
                time.sleep(3)
                log("Trying fresh browsers on the same profile, one after another:")
                normal_ua = ua.replace("HeadlessChrome", "Chrome")
                a = check(pw, "A  fresh VISIBLE browser", headless=False)
                b = check(pw, "B  fresh headless, normal Chrome user-agent", headless=True, user_agent=normal_ua)
                c = check(pw, "C  fresh headless, exactly as the scheduler does it", headless=True)
                log(f"RESULT  visible={a}  headless-normal-UA={b}  headless-as-scheduler={c}")
    except HubBusy:
        print("The Seller Hub browser is busy with another job - try again in a minute.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
