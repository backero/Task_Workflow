# SD Pulse — Snapdeal Seller Intelligence Dashboard

A 24/7 local SaaS that monitors your Snapdeal seller account and turns the
deep-research findings on Snapdeal's ranking system into live metrics, alerts,
and recommendations with reasons.

## Quick start (office PC)

```bash
pip install -r requirements.txt
python -m playwright install chromium   # only needed for browser connector
cp .env.example .env                     # edit settings
python run.py                            # opens http://127.0.0.1:8300
```

Leave the PC on; the scheduler syncs every 15 min (listings/scorecard/metrics)
and every 6 h (keyword ranks). Dashboard auto-refreshes every 60 s.

## The four data paths (set SD_CONNECTOR in .env)

| Connector | What it does | Status |
|---|---|---|
| `demo` (default) | Realistic synthetic data so every screen works immediately | Clearly labelled DEMO in the header |
| `browser` | Playwright logs into seller.snapdeal.com with a saved session | Run `python -m app.connectors.login` once — YOU log in (OTP/CAPTCHA supported) — session reused 24/7 |
| `csv` | Ingests Seller Panel exports you upload in the Sync & Data tab | 100% ToS-safe, zero automation risk |
| `api` | Official Snapdeal API | Ships ready; needs partner credentials from Snapdeal |

## Truth sheet — read this

1. **Snapdeal has no public seller analytics API.** No tool can "just connect"
   with your password over an official channel. Anyone claiming otherwise is
   scraping (like the `browser` connector here) or has partner access.
2. **Browser automation risk is real and yours.** Snapdeal can change the panel
   layout (selectors then need an update) or restrict automated access under
   its Terms of Service. The connector fails loudly into the sync log, never
   silently; CSV mode keeps the dashboard alive as fallback.
3. **OTP is handled by session reuse, not password automation.** A robot cannot
   type your OTP. That is why you log in once yourself and the session is saved.
4. **Your credentials never leave this PC.** `.env` and
   `data/snapdeal_session.json` stay local. There is no telemetry, no cloud.
5. **Demo data is always labelled.** The DEMO badge disappears only when a real
   connector completes a sync.
6. **Rank tracker uses public search pages** (no login). It was live-tested:
   fetch + parse works; it finds YOUR listings only after you set
   `SD_TRACK_KEYWORDS` and `SD_SELLER_BRAND` in `.env`.

## What it monitors (all rules sourced from the research report)

- **Health gate**: cancellation <1%, on-time dispatch >98%, rating >4.0★,
  DTO returns vs the ~5.5% platform norm (RTO exempt — official policy).
- **Listing audit**: image QC spec, attribute completeness, title syntax,
  40–60% discount band, stock availability, ~50-review threshold, staleness.
- **Velocity**: week-over-week order drops (>40% = flywheel stall),
  CTR floor (~0.5%), per-listing 30-day trends.
- **Ads**: spend, CPC, CTR, CVR, ACOS (>40% flagged), ROAS, zero-order burn.
- **Rank tracker**: your products' positions on your keywords over time.

Every recommendation shows **Why** (the mechanism), **Do this** (the fix), and
**Evidence** (the source) — no unexplained advice.

## Troubleshooting

- Browser sync says *"Session expired"* → rerun `python -m app.connectors.login`.
- Browser sync says *layout differs* → Snapdeal changed the page; export the
  report manually and upload it in Sync & Data (csv path ingests it).
- Ranks always empty → check `SD_SELLER_BRAND` matches how your brand appears
  on snapdeal.com search tiles.
- Reset everything → stop the app, delete `data/sdpulse.db`, restart.
