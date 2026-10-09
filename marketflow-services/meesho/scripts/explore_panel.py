"""Explore the signed-in Meesho Supplier Panel by clicking its main nav items (they are not <a href> links, so the
earlier link-scrape found nothing) — READ ONLY, never clicks anything that changes data. Saves each page's text and
a screenshot to capture/explore/, using the session already saved by capture_supplier_panel.py.

    venv\\Scripts\\python.exe scripts\\explore_panel.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

SESSION_DIR = ROOT / "data" / "session"
OUT = ROOT / "capture" / "explore"
HOME = "https://supplier.meesho.com/panel/v3/new/root/login"

# text of the nav items worth a look; each is clicked from the Home page fresh (avoids stale menu state)
NAV_ITEMS = [
    "Manage Orders", "Dispatch Performance", "Returns", "Manage Pricing", "Quality",
    "Catalog Uploads", "Payments", "Business Dashboard",
]


def signed_in(page) -> bool:
    url = (page.url or "").lower()
    if "/panel/" not in url or any(w in url for w in ("login", "signin", "sign-in", "otp", "/auth/", "signup")):
        return False
    try:
        body = page.inner_text("body")
    except Exception:  # noqa: BLE001
        return False
    return "Start Selling" not in body and len(body.strip()) > 200


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40]


def save(page, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    (OUT / f"{name}.txt").write_text(page.inner_text("body")[:20000], encoding="utf-8")


def main() -> int:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(str(SESSION_DIR), headless=True, viewport={"width": 1500, "height": 1000})
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(HOME, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(6_000)
            if not signed_in(page):
                print("NOT_SIGNED_IN")
                return 1
            save(page, "00-home")
            print(f"Signed in. Landed on {page.url}")

            for i, label in enumerate(NAV_ITEMS, 1):
                try:
                    page.goto(HOME, wait_until="domcontentloaded", timeout=60_000)
                    page.wait_for_timeout(3_000)
                    page.get_by_text(label, exact=True).first.click(timeout=8_000)
                    page.wait_for_timeout(5_000)
                    name = f"{i:02d}-{slug(label)}"
                    save(page, name)
                    print(f"  {label:20s} -> saved {name}.png/.txt  (url: {page.url})")
                except Exception as exc:  # noqa: BLE001
                    print(f"  {label}: could not open ({str(exc).splitlines()[0][:120]})")
            print(f"\nDone. Saved under {OUT}")
        finally:
            ctx.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
