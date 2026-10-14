# FK-Pulse — Flipkart Seller Intelligence Platform

A 100% Python SaaS-style platform that monitors your Flipkart seller account around the clock and turns the research report's parameters into per-listing dashboards and prioritized recommendations.

## What it does
- **Auto-fetches** listings, orders, returns, settlements and inventory via the official **Flipkart Seller API** (OAuth2 — you generate an App ID + Secret in Seller Hub; see `docs/get_api_credentials.md`)
- **Tracks keyword rank positions** on public Flipkart search pages (optional, opt-in, rate-limited Playwright harvester — off by default)
- **Computes KPIs** on a schedule: cancellation/RTD/RTO rates, rating velocity, stock-cover days, price-vs-category-median, settlement lag, TACoS, attribute completeness (LQS proxy)
- **Generates recommendations** from 16 rule-based checks (LQS, ratings, stockouts, pricing cliff at ₹1,000, RTO clusters, BBD/event calendar, Usual-Price 15-day windows) — every recommendation cites the rule and the research chapter behind it
- **Dashboard** (Streamlit): Account Health · Listing Intelligence (per-FSN drilldown) · Rank Tracker · Pricing & Fees · Returns/RTO · Event Calendar · Recommendations

## Quick start (demo mode — no credentials needed)
```bash
pip install -r requirements.txt
python scripts/init_db.py            # creates fk_pulse.db + demo cosmetics data
python run_scheduler.py              # optional: starts the polling scheduler
python run_dashboard.py              # opens the dashboard (fixture/demo data)
```

## Going live with your account
1. Get API credentials: `docs/get_api_credentials.md`
2. `cp config.example.yaml config.yaml`, set `mode: live`
3. Store credentials in the encrypted vault (flow in `docs/runbook.md`)
4. Optional rank tracking: `playwright install chromium`, set `harvester.enabled: true`
5. 24/7 operation on an office PC: `scripts/windows_setup.md` (Task Scheduler autostart)

## Honest limitations
Read `docs/limitations.md` — ads metrics arrive via CSV import in v1, the displayed LQS value isn't exposed by any API (we compute a proxy), and rank positions are from non-personalized public SERPs. Nothing in this platform fakes data it cannot fetch.

## Architecture
See `../ARCHITECTURE.md` and `../SPEC.md`. Tests: `pytest tests/` (29 tests).
