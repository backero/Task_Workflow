# Amazon seller mirror

This connector uses Amazon's official Selling Partner API (SP-API); it does
not automate Seller Central or retain login credentials.

## One-time setup

1. Register or use a Seller Central SP-API application and request the roles
   needed for Orders now. Listing, Reports, Finances and Advertising roles can
   be added as their collectors are enabled.
2. In `backero-backend/.env` on the collector computer, set
   `AMAZON_LWA_CLIENT_ID`, `AMAZON_LWA_CLIENT_SECRET`,
   `AMAZON_LWA_REFRESH_TOKEN`, `AMAZON_AWS_ACCESS_KEY_ID`, and
   `AMAZON_AWS_SECRET_ACCESS_KEY`. Do not put any of these values in the
   frontend, Git, capture JSON, or a chat.
3. Create the environment for the collector (it needs `requests`, `pymongo`,
   and `python-dotenv`), then run `python sync.py` from this directory. It
   writes only a normalized, non-secret capture to `data/capture.json`.
4. Run the existing publisher with `--platform amazon --watch`, setting the
   same organization/database variables used by the other marketplace mirrors.

The first connector deliberately captures only the first SP-API order page for
the last 30 days. The dashboard labels this partial coverage. More report/API
roles are required before inventory/listings, order items, returns, settlements,
advertising performance, or search terms are enabled.
