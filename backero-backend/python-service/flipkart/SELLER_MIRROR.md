# Backero Flipkart Seller Hub mirror

The main website's `/flipkart/overview` reads an organization-scoped copy of
the existing Seller Hub captures. It does not require the retired Python HTTP API.

Data flow: existing authenticated Seller Hub reader → `fk_pulse.db` →
`fkpulse.mirror.sync_mirror` → MongoDB `flipkartsellermirrors` →
`GET /api/marketflow/flipkart/seller-mirror` → Backero.

## Configuration

Set `FLIPKART_ORGANIZATION_ID` in `backero-backend/.env` to the Backero organization
that owns the currently authenticated Flipkart account. Verify the account owner
before binding. No seller credentials or cookies are sent to the frontend.
The endpoint requires an authenticated admin of that organization.

The normal `run_scheduler.py` now publishes details alongside its overview every
three minutes after restart. If an existing scheduler is already running, start
the separate read-only publisher without interrupting its browser session:

```powershell
cd backero-backend/python-service/flipkart
.\venv\Scripts\python.exe scripts/sync_mirror.py --watch
```

This publishes existing captures every minute; it does not launch a second
browser or trigger another seller scrape. After restarting the updated scheduler,
the separate publisher is optional and can be stopped. The browser scrape interval
is controlled by `sellerhub.minutes` in `config.yaml`; publication and scraping
are different operations. The webpage refreshes saved data every minute.

## Coverage and limitations

- Seller Hub home, traffic, business health, inventory, order counts, payments,
  returns and listing status metrics, with capture dates for each field.
- Captured active listing rows and ad campaign rows, each with its source date.
- To Accept packing queue when captured; not full order history.
- Ads CTR/CVR remain separate from Traffic Report conversion. Organic CTR and
  seller keyword/search-term reports have not been captured and remain unavailable.
- Missing rows are not a confirmed zero. An older table capture can remain visible
  after a newer metrics read; the table's own date is shown explicitly.
- Source SQLite timestamps are local IST; Mongo publication timestamps are UTC.
- This uses the existing shared local Flipkart profile and database. It is a
  single seller account integration, not a multi-account connection manager.

## Validation

```powershell
.\venv\Scripts\python.exe -m pytest tests/test_mirror.py -q
```

Tests cover latest captures, actual zeros versus missing values, partial errors,
read-only missing database handling, and refusing to publish without org binding.
