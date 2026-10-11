"""One-time sign-in to Flipkart Seller Hub in a dedicated browser profile.

Opens a visible Chromium window on seller.flipkart.com using a persistent profile folder
(``sellerhub-profile/``). YOU sign in by hand (password / mobile OTP) — this script never sees or stores your
credentials; the login session lives in the profile, exactly like a normal browser. It waits until the sign-in
succeeds, then closes. Later runs of the Seller Hub readers reuse the same session, so you only repeat this
when Flipkart eventually asks you to sign in again.

    python scripts/sellerhub_login.py            (waits up to 15 minutes for you to finish signing in)
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "sellerhub-profile"
LOGIN_URL = "https://seller.flipkart.com/"
WAIT_MINUTES = 15


def looks_signed_in(url: str, body: str) -> bool:
    u = url.lower()
    if "seller.flipkart.com" not in u or "login" in u or "signin" in u or "authenticate" in u or "referral_url" in u:
        return False
    text = body.lower()
    # The PUBLIC landing page (seller.flipkart.com/) says "Insights & Tools", "Grow", "Fees"... — the same words as the
    # dashboard — so it once passed for "signed in" while showing Login / Start Selling buttons. The real dashboard lives
    # at /index.html#dashboard/..., and never offers to start selling.
    if "start selling" in text or "become an online seller" in text:
        return False
    if "index.html" not in u:
        return False
    markers = ("listings", "orders", "payments", "growth", "performance", "insights")
    return sum(1 for m in markers if m in text) >= 3


def main() -> int:
    from playwright.sync_api import sync_playwright

    PROFILE.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(str(PROFILE), headless=False, viewport={"width": 1400, "height": 900})
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60_000)
        print("A Flipkart Seller Hub window is open. Please sign in there (password / OTP).", flush=True)
        deadline = time.time() + WAIT_MINUTES * 60
        ok = False
        while time.time() < deadline:
            time.sleep(4)
            try:
                page = ctx.pages[-1]
                body = page.inner_text("body")
                if looks_signed_in(page.url, body):
                    time.sleep(3)  # let the session cookies settle before closing
                    ok = True
                    break
            except Exception:  # noqa: BLE001 — a page mid-navigation is normal while signing in
                continue
        ctx.close()
    if ok:
        print("SIGNED_IN — the Seller Hub session is saved in sellerhub-profile/.", flush=True)
        return 0
    print(f"NOT_SIGNED_IN — no sign-in detected within {WAIT_MINUTES} minutes.", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
