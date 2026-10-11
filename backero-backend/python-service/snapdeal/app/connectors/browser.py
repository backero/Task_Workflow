"""Browser connector identity — Playwright automation of seller.snapdeal.com happens elsewhere.

HONEST DESIGN NOTES (also in README):
1. Snapdeal has NO public seller analytics API. Real data comes from driving a real, signed-in browser —
   see app/connectors/snapdeal_keeper.py (keeps one window open and signed in) and
   app/connectors/panel_reader.py (the actual page readers, built from real captured pages).
2. This class exists only so app/scheduler.py's sync_now() can recognise "browser" mode and hand off to
   _browser_sync(), which reports the keeper's latest read instead of opening a second, short-lived browser.
   A fetch_listings/fetch_metrics/etc. pipeline used to live here (cold Playwright launch per sync, storage_state
   replay); it was replaced 2026-09-27 because Snapdeal rejects replayed cookies from a fresh browser (error 422)
   and because relaunching cold every sync could never outrun Snapdeal's own short idle-timeout - the same problem
   already solved for Meesho and Flipkart with a keeper. Removed rather than left in place: dead code that still
   looks like the real path is worse than no code, since a future reader could trust it by mistake.
3. Credentials never leave this PC.
"""
from .base import Connector


class BrowserConnector(Connector):
    name = "browser"
    is_demo = False
