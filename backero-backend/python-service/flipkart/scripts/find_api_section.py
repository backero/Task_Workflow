"""Look for Flipkart Seller Hub's Developer / API-access section — READ ONLY.

Waits for the Seller Hub browser (the keeper may be using it), then looks at the signed-in session already open on
this laptop: the menus, and any link whose text mentions API/Developer/Integration/App. Saves what it finds
(screenshots + link text) to hub-debug/api-section/ so the next step can be decided from evidence.

This never clicks a button that CREATES, REGISTERS, GENERATES or REGENERATES anything — those are live, hard-to-undo
actions on the seller account and need the owner's go-ahead first. It only looks.

    venv\\Scripts\\python.exe scripts\\find_api_section.py
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
WRITE_WORDS = re.compile(r"generate|regenerate|register|create app|revoke|reset|delete|new secret", re.I)
INTEREST = re.compile(r"\bapi\b|developer|integration|\bapp\b", re.I)


def save(page, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    (OUT / f"{name}.txt").write_text(page.inner_text("body")[:20000], encoding="utf-8")


def main() -> int:
    from playwright.sync_api import sync_playwright

    try:
        with hub_lock(wait_s=120):
            with sync_playwright() as pw:
                ctx = pw.chromium.launch_persistent_context(str(PROFILE), headless=True, viewport={"width": 1500, "height": 1000})
                try:
                    page = ctx.pages[0] if ctx.pages else ctx.new_page()
                    page.goto(sh.URL_HOME, wait_until="domcontentloaded", timeout=60_000)
                    page.wait_for_timeout(5_000)
                    if sh._is_landing(page):
                        print("NOT_SIGNED_IN")
                        return 1
                    save(page, "00-home")

                    links = page.evaluate("""() => [...document.querySelectorAll('a[href], button, [role=menuitem]')]
                        .map(e => ({t: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' '),
                                    h: e.tagName === 'A' ? e.href : null}))
                        .filter(x => x.t && x.t.length <= 60)""")
                    hits = [l for l in links if INTEREST.search(l["t"])]
                    (OUT / "candidate-links.json").write_text(json.dumps(hits, indent=1), encoding="utf-8")
                    print(f"found {len(hits)} candidate link(s):")
                    for l in hits:
                        print(" -", l["t"], "|", l["h"])

                    for i, l in enumerate(hits[:6]):
                        if not l["h"]:
                            continue
                        try:
                            page.goto(l["h"], wait_until="domcontentloaded", timeout=45_000)
                            page.wait_for_timeout(4_000)
                            name = f"{i+1:02d}-" + re.sub(r"[^a-z0-9]+", "-", l["t"].lower())[:30]
                            save(page, name)
                            body = page.inner_text("body")
                            writey = WRITE_WORDS.findall(body)
                            print(f"  visited: {l['t']} -> saved {name}.png/.txt" + (f"  (page offers: {sorted(set(w.lower() for w in writey))})" if writey else ""))
                        except Exception as exc:  # noqa: BLE001
                            print(f"  could not open {l['t']}: {str(exc).splitlines()[0][:120]}")
                    print(f"\nDone. Everything saved read-only under {OUT}")
                finally:
                    ctx.close()
    except HubBusy:
        print("The Seller Hub browser is busy (the keeper is using it) - try again shortly.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
