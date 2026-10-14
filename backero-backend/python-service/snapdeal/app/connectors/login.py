"""Sign in to Snapdeal's Seller Panel and save the session for the browser connector to reuse.

Opens a visible browser window on this laptop. Sign in yourself — password, OTP, CAPTCHA, whatever Snapdeal asks;
this script never sees your credentials. It only watches the window and saves the session once it looks signed in,
the same read-only way the Meesho and Flipkart tools in this project do it (no "press Enter when done" needed).

    python -m app.connectors.login

Real signed-in dashboard confirmed 2026-09-26 (seller.snapdeal.com/#/dashboard, "Hi BACKERO PRIVATE LIMITED!",
Account Code S63891). `_looks_signed_in` originally also rejected any page with an `input[type='password']`
anywhere in the DOM as a signal it was still a login page — but the real dashboard keeps one there too (hidden,
likely a password-change field), so that check produced a false NOT_SIGNED_IN on a genuinely signed-in window.
Dropped that check; URL + dashboard-word matching alone is what's verified to work.
"""
from __future__ import annotations

import os
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SESSION = os.environ.get("SD_SESSION_FILE", os.path.join(BASE, "data", "snapdeal_session.json"))
WAIT_MINUTES = 15


def _looks_signed_in(page) -> bool:
    url = (page.url or "").lower()
    if "login" in url or "signin" in url or "sign-in" in url:
        return False
    try:
        body = page.inner_text("body").lower()
    except Exception:  # noqa: BLE001 - a page mid-navigation is normal while signing in
        return False
    off_landing = url.rstrip("/") != "https://seller.snapdeal.com"
    dashboard_words = sum(w in body for w in ("dashboard", "orders", "listings", "inventory", "logout", "sign out", "my account"))
    return off_landing and dashboard_words >= 2


def main() -> int:
    from playwright.sync_api import sync_playwright

    os.makedirs(os.path.dirname(SESSION), exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto("https://seller.snapdeal.com", wait_until="domcontentloaded", timeout=60_000)
        print("A Snapdeal Seller Panel window is open - please sign in (password / OTP / CAPTCHA). "
              "Waiting up to 15 minutes...", flush=True)
        diag = os.path.join(BASE, "data", "login-diagnostics")
        os.makedirs(diag, exist_ok=True)
        end, ok, last_shot = time.time() + WAIT_MINUTES * 60, False, 0.0
        while time.time() < end and not ok:
            time.sleep(4)
            try:
                p = ctx.pages[-1]
                ok = _looks_signed_in(p)
                if time.time() - last_shot >= 20:
                    last_shot = time.time()
                    try:
                        p.screenshot(path=os.path.join(diag, f"t{int(time.time())}.png"))
                        with open(os.path.join(diag, f"t{int(time.time())}.txt"), "w", encoding="utf-8") as fh:
                            fh.write(f"url: {p.url}\n\n{p.inner_text('body')[:2000]}")
                    except Exception:  # noqa: BLE001
                        pass
            except Exception:  # noqa: BLE001
                pass
        if not ok:
            # the while condition can exit on the time limit in the same instant sign-in actually completes
            # (seen once: a real dashboard was on screen but the loop ended before re-checking it) - look once more.
            try:
                ok = _looks_signed_in(ctx.pages[-1])
            except Exception:  # noqa: BLE001
                pass
        if not ok:
            print(f"NOT_SIGNED_IN - nothing saved. Diagnostic screenshots are in {diag} (what the window actually showed while waiting).", flush=True)
            browser.close()
            return 1
        page = ctx.pages[-1]
        page.wait_for_timeout(3_000)
        ctx.storage_state(path=SESSION)
        print(f"SIGNED_IN - session saved to {SESSION}", flush=True)
        print("Set SD_CONNECTOR=browser in the environment (or .env) and restart the app.", flush=True)
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
