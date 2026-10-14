import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False, args=["--window-position=0,0", "--window-size=1400,900"])
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto("https://seller.flipkart.com/", wait_until="domcontentloaded", timeout=60_000)
    print("Flipkart Seller Hub window opened. Waiting indefinitely -- log in via the VNC viewer.", flush=True)
    # Block forever so the browser stays open; the keeper/login flow is manual via VNC.
    import time
    while True:
        time.sleep(30)
