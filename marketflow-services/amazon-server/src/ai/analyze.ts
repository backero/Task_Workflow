import Anthropic from '@anthropic-ai/sdk'
import { sqlite } from '../db/client.js'

// Root-cause analysis for fired alerts, grounded in how Amazon's ranking/conversion
// algorithm actually weighs factors — replaces the rules engine's generic canned
// suggested_action with a diagnosis specific to this SKU's actual data.
// Silently no-ops until ANTHROPIC_API_KEY is set, matching notifications/email.ts.
const { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } = process.env
const isConfigured = !!ANTHROPIC_API_KEY
const client = isConfigured ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null
const MODEL = ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001' // cheap model: runs on every fired alert

const SYSTEM_PROMPT = `You are an Amazon marketplace analyst. Amazon's organic ranking and sales are driven mainly by:
- Relevancy: keyword match in title/bullets/backend search terms
- Conversion rate (sessions -> orders): the single biggest ranking lever
- Price competitiveness vs Buy-Box-eligible rivals
- Availability: in-stock, Buy Box win rate, delivery speed
- Customer satisfaction: rating, review count/velocity, return rate
- Sales velocity: recent unit velocity drives BSR and downstream visibility
- Advertising: sponsored placement drives traffic which feeds the conversion signal, but is a separate lever from organic rank

You'll be given one fired alert for a seller's own ASIN plus its recent raw data
(listing/ads series, price/rating history, live competitor snapshots, keyword ranks).
Diagnose the most likely root cause(s), tying back explicitly to these factors, and give
a specific, prioritized, actionable fix — not generic advice like "check your listing".
Be concise: 3-5 sentences. If the data doesn't clearly support one cause over another,
say so and name the one piece of data that would confirm it.

Every row carries a data_quality tag. Rows tagged "estimate" are approximations (a date-range total
spread evenly across days, or seed/placeholder values) — NOT real daily measurements. Never treat a
change between estimated days as a real event, and don't diagnose a trend that exists only in estimated
rows; say the data is too thin instead. "observed" rows are real readings from Seller Central or the
public storefront. Empty ads data means ads aren't connected yet, not zero spend.`

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
  const message = await client!.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: JSON.stringify({ alert: { title: alert.title, message: alert.message }, data: context }) },
    ],
  })
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim() || null
}

export async function analyzeAndStoreAlerts(alerts: AlertToAnalyze[]) {
  // Account-level alerts (Account Health, contact, ads) aren't product diagnoses — their suggested action is already specific.
  alerts = alerts.filter((a) => a.scopeType !== 'account')
  if (alerts.length === 0) return
  if (!isConfigured) {
    console.warn(`[ai] ANTHROPIC_API_KEY not configured — skipping AI analysis for ${alerts.length} alert(s).`)
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
