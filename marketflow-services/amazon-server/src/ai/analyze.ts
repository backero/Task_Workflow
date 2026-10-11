import { sqlite } from '../db/client.js'
import * as jev from './jevClient.js'

// Root-cause diagnosis for fired alerts, grounded in how Amazon's ranking/conversion
// algorithm actually weighs factors — replaces the rules engine's generic canned
// suggested_action with structured predictions (which factor is likely at fault, and
// how confident) specific to this SKU's actual data. Jev, TypeSafe's System One model
// (docs.typesafe.ai), answers typed yes/no (noul), choice and score questions with
// probabilities rather than writing prose, which is a better, cheaper fit for "what's
// right or wrong here" than a narrative model. Silently no-ops until TYPESAFE_API_KEY
// is set, matching notifications/email.ts's own pattern.
const isConfigured = jev.isConfigured()

// Root-cause diagnosis questions, tailored to Amazon's own ranking factors (relevancy,
// conversion, price, availability, satisfaction, velocity, ads) — a per-alert diagnosis,
// not a periodic whole-account review (see ai-insights.ts for that pattern).
const ALERT_DIAGNOSIS_QUESTIONS = {
  pricing_cause: jev.noul("Based on this ASIN's price history vs. competitor snapshots, is pricing a likely root cause of this alert?"),
  availability_cause: jev.noul('Based on stock/Buy-Box data, is availability or Buy Box loss a likely root cause of this alert?'),
  conversion_cause: jev.noul('Based on sessions/page-views/units-ordered trends, is a conversion-rate or listing-quality drop a likely root cause of this alert?'),
  advertising_cause: jev.noul('Based on the ads series (impressions/clicks/spend/ad_sales), is a change in advertising a likely root cause of this alert?'),
  confidence: jev.score('How confident is this diagnosis, given how much real (non-estimated) data is available?', [
    'Not confident — mostly estimated/thin data',
    'Somewhat confident — partial real data',
    'Confident — solid real data',
    'Very confident — strong, consistent real data',
  ]),
  root_cause: jev.choice('Which single factor is most likely the root cause of this alert?', {
    pricing: 'Price vs. competitors',
    availability: 'Stock or Buy Box loss',
    conversion_or_listing: 'Conversion rate or listing quality',
    reviews_or_rating: 'Reviews or rating',
    advertising: 'Advertising spend or performance',
    sales_velocity: 'Recent unit sales velocity',
  }),
}

type AlertToAnalyze = {
  id: string
  scopeType: 'asin' | 'sku' | 'keyword' | 'account'
  scopeId: string
  title: string
  message: string
  evidence: Record<string, unknown>
}

function resolveAsinSku(scopeType: string, scopeId: string): { asin: string | null; sku: string | null } {
  if (scopeType === 'asin') {
    const p = sqlite.prepare('SELECT sku FROM dim_product WHERE asin = ?').get(scopeId) as { sku: string } | undefined
    return { asin: scopeId, sku: p?.sku ?? null }
  }
  if (scopeType === 'sku') {
    const p = sqlite.prepare('SELECT asin FROM dim_product WHERE sku = ?').get(scopeId) as { asin: string } | undefined
    return { asin: p?.asin ?? null, sku: scopeId }
  }
  return { asin: null, sku: null } // keyword-scoped alerts have no single ASIN context
}

function buildContext(alert: AlertToAnalyze): Record<string, unknown> {
  const { asin } = resolveAsinSku(alert.scopeType, alert.scopeId)
  const context: Record<string, unknown> = { alert_evidence: alert.evidence }
  if (!asin) return context

  context.product = sqlite.prepare('SELECT asin, sku, name, category, price, cogs FROM dim_product WHERE asin = ?').get(asin)

  context.listing_last_14d = sqlite.prepare(`
    SELECT date, sessions, page_views, buy_box_pct, units_ordered, ordered_product_sales, data_quality
    FROM fact_listing_daily WHERE asin = ? ORDER BY date DESC LIMIT 14
  `).all(asin)

  context.price_history_last_10 = sqlite.prepare(`
    SELECT captured_at, price, coupon_deal_flag, bsr, rating, review_count, data_quality
    FROM fact_price_snapshot WHERE asin = ? ORDER BY captured_at DESC LIMIT 10
  `).all(asin)

  context.ads_last_14d = sqlite.prepare(`
    SELECT date, SUM(impressions) impressions, SUM(clicks) clicks, SUM(spend) spend, SUM(ad_sales) ad_sales
    FROM fact_ads_daily WHERE asin = ? GROUP BY date ORDER BY date DESC LIMIT 14
  `).all(asin)

  context.keyword_ranks_recent = sqlite.prepare(`
    SELECT keyword, date, organic_rank, sponsored_rank, data_quality FROM fact_keyword_rank_daily
    WHERE asin = ? ORDER BY date DESC LIMIT 20
  `).all(asin)

  const rivals = sqlite.prepare('SELECT asin, name FROM dim_product WHERE watches_asin = ? AND is_own = 0').all(asin) as { asin: string; name: string }[]
  context.competitors = rivals.map((c) => ({
    name: c.name,
    latest_snapshot: sqlite.prepare(`
      SELECT price, coupon_deal_flag, rating, review_count, data_quality FROM fact_price_snapshot
      WHERE asin = ? ORDER BY captured_at DESC LIMIT 1
    `).get(c.asin) ?? null,
  }))

  return context
}

async function analyzeOne(alert: AlertToAnalyze): Promise<string | null> {
  const context = buildContext(alert)
  const predictions = await jev.ask({ alert: { title: alert.title, message: alert.message }, data: context }, ALERT_DIAGNOSIS_QUESTIONS)
  return JSON.stringify(predictions)
}

export async function analyzeAndStoreAlerts(alerts: AlertToAnalyze[]) {
  // Account-level alerts (Account Health, contact, ads) aren't product diagnoses — their suggested action is already specific.
  alerts = alerts.filter((a) => a.scopeType !== 'account')
  if (alerts.length === 0) return
  if (!isConfigured) {
    console.warn(`[ai] TYPESAFE_API_KEY not configured — skipping AI analysis for ${alerts.length} alert(s).`)
    return
  }

  const update = sqlite.prepare('UPDATE alerts SET ai_analysis = ? WHERE id = ?')
  for (const alert of alerts) {
    try {
      const analysis = await analyzeOne(alert)
      if (analysis) update.run(analysis, alert.id)
    } catch (err) {
      console.error(`[ai] analysis failed for alert ${alert.id}:`, err instanceof Error ? err.message : err)
    }
  }
}
