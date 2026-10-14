"""Sign in to the Meesho Supplier Panel and capture what each main page looks like (read-only), so the reader can be
built from the real pages instead of guessed selectors.

You sign in yourself (mobile OTP) in the window this opens; the script never sees the OTP. Once you are in, it:
  1. writes down the menu links of the dashboard,
  2. opens each main page in turn (read only: it only looks, never clicks Save/Submit/Upload),
  3. saves the page's visible text and a screenshot into capture/  (private: stays on this computer),
  4. also measures how long the login lasts while the window is being used.

    venv\\Scripts\\python.exe scripts\\capture_supplier_panel.py
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "data" / "session"          # the same profile the app's "Connect" button uses
OUT = ROOT / "capture"
HOME = "https://supplier.meesho.com/panel/v3/new/root/login"
WAIT_SIGNIN_MIN = 15
NAV_ITEMS = [
    "Manage Orders", "Dispatch Performance", "Returns", "Manage Pricing", "Quality",
    "Catalog Uploads", "Payments", "Business Dashboard",
]


def log(msg: str) -> None:
    line = f"{datetime.now():%H:%M:%S}  {msg}"
    print(line, flush=True)
    with open(OUT / "capture.log", "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def looks_signed_in(page) -> bool:
    """Signed in = inside the panel (not the public marketing page, not the login / sign-up pages).

    The public page supplier.meesho.com/ mentions "orders", "catalog", "payments" in its marketing text, so text alone
    is not evidence; the address and the absence of the "Start Selling" / "Login" calls to action are.
    """
    url = (page.url or "").lower()
    if "/panel/" not in url or any(w in url for w in ("login", "signin", "sign-in", "otp", "/auth/", "signup")):
        return False
    try:
        body = page.inner_text("body")
    except Exception:  # noqa: BLE001
        return False
    return "Start Selling" not in body and "Sell online to Crores" not in body and len(body.strip()) > 200


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "page"


def main() -> int:
    from playwright.sync_api import sync_playwright

    OUT.mkdir(exist_ok=True)
    PROFILE.mkdir(parents=True, exist_ok=True)
    (OUT / "capture.log").write_text("", encoding="utf-8")
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(str(PROFILE), headless=False, viewport={"width": 1400, "height": 900})
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(HOME, wait_until="domcontentloaded", timeout=60_000)
            log("A Meesho Supplier Panel window is open - please sign in with your mobile OTP. Waiting up to 15 minutes...")
            end, ok = time.time() + WAIT_SIGNIN_MIN * 60, False
            last_shot = 0.0
            diag = OUT / "diagnostics"
            diag.mkdir(exist_ok=True)
            while time.time() < end and not ok:
                time.sleep(4)
                try:
                    page = ctx.pages[-1]
                    ok = looks_signed_in(page)
                    if time.time() - last_shot >= 20:
                        last_shot = time.time()
                        try:
                            page.screenshot(path=str(diag / f"t{int(time.time())}.png"))
                            (diag / f"t{int(time.time())}.txt").write_text(f"url: {page.url}\n\n{page.inner_text('body')[:2000]}", encoding="utf-8")
                        except Exception:  # noqa: BLE001
                            pass
                except Exception:  # noqa: BLE001
                    pass
            if not ok:
                log("NOT_SIGNED_IN - nothing captured. Diagnostic screenshots are in capture/diagnostics/ (what the window actually showed while waiting).")
                return 1
            t0 = time.time()
            page.wait_for_timeout(6_000)
            log(f"SIGNED_IN. landed on {page.url}")
            (OUT / "00-landing.txt").write_text(page.inner_text("body")[:80_000], encoding="utf-8")
            page.screenshot(path=str(OUT / "00-landing.png"), full_page=True)

            # The nav items are not <a href> links (an href-scrape here found zero) - they are click-driven SPA
            # items, so open each by its visible text instead, in this SAME session (Meesho's login is short-lived
            # like Flipkart's: it ended within a few idle minutes once, between two separate script runs).
            for i, label in enumerate(NAV_ITEMS, 1):
                try:
                    page.goto(HOME, wait_until="domcontentloaded", timeout=60_000)
                    page.wait_for_timeout(3_000)
                    try:
                        page.get_by_text(label, exact=True).first.click(timeout=8_000)
                    except Exception:  # noqa: BLE001 - some items are nested/non-exact; try a looser match once
                        page.get_by_text(label, exact=False).first.click(timeout=8_000)
                    page.wait_for_timeout(7_000)
                    name = f"{i:02d}-{slug(label)}"
                    (OUT / f"{name}.txt").write_text(page.inner_text("body")[:80_000], encoding="utf-8")
                    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
                    log(f"  {name:38s} saved  url={page.url}  ({(time.time() - t0) / 60:.1f} min after sign-in)")
                    # Deliberately not stopping on a "looks logged out" guess here: every such guess so far turned
                    # out to be a false alarm from a brief mid-page redirect (the saved content was fine both times),
                    # and stopping early is a worse failure than saving one thin/empty file on a genuine logout -
                    # check the saved .txt files afterward instead of trusting a live heuristic.
                except Exception as exc:  # noqa: BLE001
                    log(f"  {label}: {str(exc).splitlines()[0][:120]}")
            log("DONE. Captured pages are in the capture folder.")
        finally:
            ctx.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
