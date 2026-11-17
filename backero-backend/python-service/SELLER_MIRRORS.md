# Detailed marketplace mirrors

The main website reads organization-scoped snapshots for Flipkart, Meesho and
Snapdeal through `/api/marketflow/{platform}/seller-mirror`. These new endpoints
require an admin and always filter on the authenticated user's organization.
Legacy marketplace overview endpoints are separate.

Set `FLIPKART_ORGANIZATION_ID`, `MEESHO_ORGANIZATION_ID`, and
`SNAPDEAL_ORGANIZATION_ID` in `backero-backend/.env` after verifying which Backero
organization owns each existing seller browser profile. No default organization
is inferred by the publishers. Missing binding disables publication.

Each platform still has one existing seller profile/database. The bindings do
not implement multi-account seller login. Seller browser cookies stay local.
The new Mongo collections contain selected business fields, not credentials.

## Run without interrupting existing browsers

From each platform directory:

```powershell
# Flipkart
.\venv\Scripts\python.exe scripts/sync_mirror.py --watch
# Meesho or Snapdeal
.\venv\Scripts\python.exe sync_mirror.py --watch
```

These publishers read SQLite in a consistent read-only transaction and publish
every minute. They do not launch browsers or scrape again. Updated scheduler
and watchdog code also publishes mirrors after those processes next restart;
the separate publishers are useful while old browser processes remain open.

For a website database different from the local development backend, configure
`MARKETPLACE_MIRROR_DATABASE` and `MARKETPLACE_MIRROR_ORGANIZATION_ID` in the
collector's backend `.env`. The shared `publish_mirror.py` verifies that the
destination organization exists and is active before publishing. Start its
three workers with `pm2 start mirrors.ecosystem.config.cjs` and `pm2 save`.
These workers publish using explicit destinations and restart independently;
a publishing failure does not close a seller browser. The seller collector PC
must remain running and online for fresh captures to reach the live website.

The websites poll saved snapshots once per minute. Keep source capture times
separate from publication time. A recent website sync does not mean the seller
was scraped recently.

## Session states and coverage

- `needs_you`: seller session expired; sign in manually in the existing seller
  browser with whatever OTP/CAPTCHA the platform requires. Saved data remains
  visible with its old dates. Never ask users to send OTPs in chat.
- `partial`: some source areas failed; older dated values may remain visible.
- Snapdeal Ads has its own SSO login. `sections.ads.state=needs_login` explains
  that requirement separately from the healthy main Seller Panel session.
- Healthy collector browsers no longer restart on a fixed five-hour schedule.
  `MARKETPLACE_RESTART_HOURS` can explicitly opt into periodic restarts. Real
  platform session expiry still requires the account owner's login/OTP.
- Snapdeal: panel metrics, actual listing rows, captured performance rows and
  settlements. Ads can fail independently and must not become fabricated zeros.
- Meesho: captured products/pricing and panel metrics. Existing captured
  conversion rates are inconsistent and intentionally unavailable until their
  column mapping and basis can be verified against a fresh seller panel.
- Flipkart: captured listings/campaigns and partial completed shipment IDs.
  Flipkart currently reports an upstream failure retrieving order-item details.
  History is explicitly partial, not a complete order archive. Returns currently
  cover only the self-ship Return Request queue. See flipkart/SELLER_MIRROR.md.
- Organic CTR, seller keyword/search-term reports, and full order/return details
  are not universally available in these captures. Each page states its limits.

## Checks

Run `tests/test_mirror.py` in each platform directory. Flipkart also has
`tests/test_history.py`. If a platform environment lacks pytest, the Flipkart
environment has the test runner and can run these tests from that platform's
directory; these modules use stdlib SQLite for export tests.
