"""Follow-up to find_api_section.py — READ ONLY. Opens the "Partner Services" nav item and the account (profile)
dropdown, since the API/Developer section did not appear as a plain link on the Home page. Never clicks anything
that creates, registers, generates or regenerates.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fkpulse import sellerhub as sh  # noqa: E402
from fkpulse.hublock import HubBusy, hub_lock  # noqa: E402

PROFILE = ROOT / "sellerhub-profile"
OUT = ROOT / "hub-debug" / "api-section"
INTEREST = re.compile(r"\bapi\b|developer|integration|\bapp\b|partner", re.I)


def save(page, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    (OUT / f"{name}.txt").write_text(page.inner_text("body")[:20000], encoding="utf-8")


def links_like(page):
    all_links = page.evaluate("""() => [...document.querySelectorAll('a[href], button, [role=menuitem], li')]
        .map(e => ({t: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' '),
                    h: e.tagName === 'A' ? e.href : null}))
        .filter(x => x.t && x.t.length <= 60 && x.t.length > 0)""")
    seen, out = set(), []
    for l in all_links:
        k = (l["t"], l["h"])
        if k in seen:
            continue
        seen.add(k)
        out.append(l)
    return out


def main() -> int:
    from playwright.sync_api import sync_playwright

    try:
        with hub_lock(wait_s=30):
            with sync_playwright() as pw:
                ctx = pw.chromium.launch_persistent_context(str(PROFILE), headless=True, viewport={"width": 1500, "height": 1000})
                try:
                    page = ctx.pages[0] if ctx.pages else ctx.new_page()
                    page.goto(sh.URL_HOME, wait_until="domcontentloaded", timeout=60_000)
                    page.wait_for_timeout(5_000)
                    if sh._is_landing(page):
                        print("NOT_SIGNED_IN")
                        return 1

                    # 1) Partner Services nav item
                    try:
                        page.get_by_text("Partner Services", exact=False).first.click(timeout=8_000)
                        page.wait_for_timeout(4_000)
                        save(page, "partner-services")
                        hits = [l for l in links_like(page) if INTEREST.search(l["t"])]
                        print(f"Partner Services page: {page.url}")
                        print(f"  {len(hits)} interesting item(s):")
                        for l in hits:
                            print("   -", l["t"], "|", l["h"])
                    except Exception as exc:  # noqa: BLE001
                        print("Could not open Partner Services:", str(exc).splitlines()[0][:150])

                    # 2) account/profile dropdown (top right, the seller name)
                    page.goto(sh.URL_HOME, wait_until="domcontentloaded", timeout=60_000)
                    page.wait_for_timeout(4_000)
                    try:
                        page.locator("header, [class*=header], [class*=Header], [class*=nav]").last.locator("text=Backero").first.click(timeout=8_000)
                    except Exception:
                        try:
                            page.get_by_text("Backero", exact=False).last.click(timeout=8_000)
                        except Exception as exc:  # noqa: BLE001
                            print("Could not open the account menu:", str(exc).splitlines()[0][:150])
                            ctx.close()
                            return 0
                    page.wait_for_timeout(2_500)
                    save(page, "account-menu")
                    menu_items = links_like(page)
                    (OUT / "account-menu-items.json").write_text(json.dumps(menu_items, indent=1), encoding="utf-8")
                    print(f"Account menu: {len(menu_items)} item(s) (saved account-menu-items.json), interesting ones:")
                    for l in [x for x in menu_items if INTEREST.search(x["t"])]:
                        print("   -", l["t"], "|", l["h"])
                finally:
                    ctx.close()
    except HubBusy:
        print("The Seller Hub browser is busy - try again shortly.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
