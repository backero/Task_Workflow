import { Router } from 'express'
import { sqlite } from '../db/client.js'
import { acos, ctr, ESTIMATED_FEE_RATE, ESTIMATED_SHIPPING, organicCvr, pctChange, tacos, unitEconomics } from '../metrics.js'
import { cogsStatus } from '../lib/cogs.js'
import { edgeAgentHealth } from '../health.js'

const router = Router()



function latestDate(table: string, dateCol = 'date'): string | null {
  const row = sqlite.prepare(`SELECT MAX(${dateCol}) as d FROM ${table}`).get() as { d: string | null }
  return row?.d ?? null
}

function daysBefore(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

type WeekTotals = {
  /** 'real' = only Robo's/Amazon's actual single-day figures were summed; 'estimate' = the window holds nothing but spread-out CSV estimates. */
  basis: 'real' | 'estimate'
  sessions: number; pageViews: number; unitsOrdered: number; orderedProductSales: number
  buyBoxWeighted: number; impressions: number; clicks: number; spend: number; adOrders: number; adSales: number
  cogsTotal: number; cogsMissing: boolean; feeTotal: number
}

function ownAsins(): string[] {
  return (sqlite.prepare('SELECT asin FROM dim_product WHERE is_own = 1').all() as { asin: string }[]).map((r) => r.asin)
}

function weekTotals(endDate: string, asins: string[]): WeekTotals {
  const start = daysBefore(endDate, 6)
  const placeholders = asins.map(() => '?').join(',')
  // Estimated rows (a date-range CSV spread evenly over its days) must not be added to real single-day figures:
  // one estimated row of ₹2,100 once made a week with ₹1,025 of real sales read as ₹3,125. When the window holds any
  // real day, only real days are summed; an all-estimate window is shown as such.
  const hasReal = (sqlite.prepare(`SELECT COUNT(*) n FROM fact_listing_daily WHERE date BETWEEN ? AND ? AND asin IN (${placeholders}) AND data_quality != 'estimate'`)
    .get(start, endDate, ...asins) as { n: number }).n > 0
  const realOnly = hasReal ? " AND data_quality != 'estimate'" : ''
  const listing = sqlite.prepare(`
    SELECT COALESCE(SUM(sessions),0) sessions, COALESCE(SUM(page_views),0) page_views,
           COALESCE(SUM(units_ordered),0) units_ordered, COALESCE(SUM(ordered_product_sales),0) ordered_product_sales,
           COALESCE(SUM(buy_box_pct * page_views),0) buy_box_weighted_sum
    FROM fact_listing_daily WHERE date BETWEEN ? AND ? AND asin IN (${placeholders})${realOnly}
  `).get(start, endDate, ...asins) as any

  const ads = sqlite.prepare(`
    SELECT COALESCE(SUM(impressions),0) impressions, COALESCE(SUM(clicks),0) clicks,
           COALESCE(SUM(spend),0) spend, COALESCE(SUM(ad_orders),0) ad_orders, COALESCE(SUM(ad_sales),0) ad_sales
    FROM fact_ads_daily WHERE date BETWEEN ? AND ? AND asin IN (${placeholders})
  `).get(start, endDate, ...asins) as any

  // Est. Margin needs per-ASIN COGS (Design Doc §4.1: sales − fees − ad_spend − COGS) —
  // joining here rather than a flat rate, since COGS varies per SKU.
  const cogs = sqlite.prepare(`
    SELECT COALESCE(SUM(f.units_ordered * p.cogs), 0) cogs_total,
           COALESCE(SUM(CASE WHEN p.fee_per_unit IS NOT NULL THEN f.units_ordered * p.fee_per_unit ELSE f.ordered_product_sales * ${ESTIMATED_FEE_RATE} + f.units_ordered * ${ESTIMATED_SHIPPING} END), 0) fee_total,
           SUM(CASE WHEN f.units_ordered > 0 AND (p.cogs IS NULL OR p.cogs_updated_at = 'ESTIMATE-30PCT') THEN 1 ELSE 0 END) missing_count
    FROM fact_listing_daily f JOIN dim_product p ON p.asin = f.asin
    WHERE f.date BETWEEN ? AND ? AND f.asin IN (${placeholders})${hasReal ? " AND f.data_quality != 'estimate'" : ''}
  `).get(start, endDate, ...asins) as any

  return {
    basis: hasReal ? 'real' as const : 'estimate' as const,
    sessions: listing.sessions, pageViews: listing.page_views,
    unitsOrdered: listing.units_ordered, orderedProductSales: listing.ordered_product_sales,
    buyBoxWeighted: listing.page_views ? listing.buy_box_weighted_sum / listing.page_views : 0,
    impressions: ads.impressions, clicks: ads.clicks, spend: ads.spend, adOrders: ads.ad_orders, adSales: ads.ad_sales,
    cogsTotal: cogs.cogs_total, cogsMissing: cogs.missing_count > 0, feeTotal: cogs.fee_total,
  }
}

/**
 * The worst data quality among own-catalog listing rows in the two 7-day windows a tile
 * compares. Tiles used to be hard-coded 'api' even though the figures come from Robo's
 * Seller Central reports ('observed') or from spread-out CSV imports ('estimate').
 */
function listingWindowQuality(endDate: string, asins: string[], basis: WeekTotals['basis']): 'api' | 'observed' | 'estimate' {
  if (basis === 'estimate') return 'estimate'
  const placeholders = asins.map(() => '?').join(',')
  const rows = sqlite.prepare(`
    SELECT DISTINCT data_quality q FROM fact_listing_daily WHERE date BETWEEN ? AND ? AND asin IN (${placeholders}) AND data_quality != 'estimate'
  `).all(daysBefore(endDate, 6), endDate, ...asins) as { q: string }[]
  const found = new Set(rows.map((r) => r.q))
  if (found.has('observed')) return 'observed'
  if (found.has('api')) return 'api'
  return 'observed'
}

// noData: the feed behind this tile doesn't exist yet (ads not connected, no COGS entered).
// Showing 0 / a green light there would read as "measured and fine" — it's "not measured".
// comparable=false: the two weeks are not like-for-like (real days vs estimates), so no week-over-week % is claimed.
function tile(label: string, unit: string, current: number, previous: number, dataQuality: string, decimals = 0, noData = false, comparable = true) {
  const delta = noData || !comparable ? null : pctChange(current, previous)
  return {
    label, unit, value: Number(current.toFixed(decimals)), previous_value: Number(previous.toFixed(decimals)),
    wow_change: delta, data_quality: dataQuality,
    status: noData ? 'amber' : statusFor(label, current),
    no_data: noData,
  }
}

function statusFor(label: string, value: number): 'green' | 'amber' | 'red' {
  // NOTE: value is the same 0-1 fraction passed to formatValue for 'pct' tiles
  if (label === 'Buy Box %') return value >= 0.95 ? 'green' : value >= 0.85 ? 'amber' : 'red'
  if (label === 'ACOS') return value <= 0.25 ? 'green' : value <= 0.4 ? 'amber' : 'red'
  return 'green'
}

/** Latest Account Health read (null if Robo never got one). */
function latestHealth() {
  return sqlite.prepare('SELECT * FROM fact_account_health ORDER BY captured_at DESC LIMIT 1').get() as any | undefined
}

/**
 * What the Ads console last showed. 'none' = nothing running (the honest reason the ads tiles are empty);
 * 'active' = ads are running but per-product ad reports aren't collected; 'unknown' = never checked.
 */
function adsState() {
  const row = sqlite.prepare('SELECT * FROM fact_ads_summary ORDER BY captured_at DESC LIMIT 1').get() as
    | { captured_at: string; range_label: string | null; impressions: number; clicks: number; sales: number }
    | undefined
  if (!row) return { state: 'unknown' as const, last_checked: null, range_label: null }
  const active = row.impressions > 0 || row.clicks > 0 || row.sales > 0
  return { state: active ? ('active' as const) : ('none' as const), last_checked: row.captured_at, range_label: row.range_label }
}

/** How many own SKUs still lack a usable COGS — the margin and ad-bleed guard depend on it. */
function cogsSummary() {
  const rows = sqlite.prepare('SELECT cogs, cogs_updated_at FROM dim_product WHERE is_own = 1').all() as { cogs: number | null; cogs_updated_at: string | null }[]
  const counts = { total: rows.length, missing: 0, estimate: 0, stale: 0, ok: 0 }
  for (const r of rows) counts[cogsStatus(r.cogs, r.cogs_updated_at).status] += 1
  return counts
}

/**
 * Reviews gained per 7 days, from real storefront readings. The old version compared against the
 * 8th-most-recent snapshot ("OFFSET 7"), which is 7 days ago only if there is exactly one snapshot
 * a day (there are ~2), and it was computed for rivals only. Here: earliest reading within the last
 * 14 days vs the latest, scaled to a week; null until the two readings are at least a day apart.
 */
function reviewVelocity7d(asin: string): number | null {
  const rows = sqlite.prepare(`
    SELECT captured_at, review_count FROM fact_price_snapshot
    WHERE asin = ? AND review_count IS NOT NULL AND data_quality = 'observed' ORDER BY captured_at ASC
  `).all(asin) as { captured_at: string; review_count: number }[]
  if (rows.length < 2) return null
  const latest = rows[rows.length - 1]
  const cutoff = Date.parse(latest.captured_at) - 14 * 86_400_000
  const first = rows.find((r) => Date.parse(r.captured_at) >= cutoff)!
  const days = (Date.parse(latest.captured_at) - Date.parse(first.captured_at)) / 86_400_000
  if (days < 1) return null
  return Math.round(((latest.review_count - first.review_count) / days) * 7 * 10) / 10
}

router.get('/v1/dashboard/command', (_req, res) => {
  const listingDate = latestDate('fact_listing_daily')
  if (!listingDate) return res.json({ tiles: [], rule_status: { red: 0, amber: 0 }, as_of: null, cogs: cogsSummary(), robo: edgeAgentHealth(), account_health: latestHealth() ?? null, ads: adsState() })

  const asins = ownAsins()
  const thisWeek = weekTotals(listingDate, asins)
  const prevWeekEnd = daysBefore(listingDate, 7)
  const prevWeek = weekTotals(prevWeekEnd, asins)

  const cvrThis = organicCvr(thisWeek.unitsOrdered, thisWeek.sessions) ?? 0
  const cvrPrev = organicCvr(prevWeek.unitsOrdered, prevWeek.sessions) ?? 0
  const ctrThis = ctr(thisWeek.clicks, thisWeek.impressions) ?? 0
  const ctrPrev = ctr(prevWeek.clicks, prevWeek.impressions) ?? 0
  const acosThis = acos(thisWeek.spend, thisWeek.adSales) ?? 0
  const acosPrev = acos(prevWeek.spend, prevWeek.adSales) ?? 0
  const tacosThis = tacos(thisWeek.spend, thisWeek.orderedProductSales) ?? 0
  const tacosPrev = tacos(prevWeek.spend, prevWeek.orderedProductSales) ?? 0

  // Fees: Seller Central's own per-unit fee where we have it (FBA); otherwise the reference estimate (18% + Rs 65 shipping per unit).
  const profitThis = thisWeek.orderedProductSales - thisWeek.feeTotal - thisWeek.spend - thisWeek.cogsTotal
  const profitPrev = prevWeek.orderedProductSales - prevWeek.feeTotal - prevWeek.spend - prevWeek.cogsTotal
  const cogsInfo = cogsSummary()
  const marginDataQuality = thisWeek.cogsMissing || cogsInfo.stale > 0 || cogsInfo.estimate > 0 ? 'estimate' : 'derived'

  const listingQ = listingWindowQuality(listingDate, asins, thisWeek.basis)
  const derivedQ = listingQ === 'estimate' ? 'estimate' : 'derived'
  const like = thisWeek.basis === prevWeek.basis
  const noAds = thisWeek.impressions === 0 && thisWeek.spend === 0 && prevWeek.impressions === 0 && prevWeek.spend === 0

  const tiles = [
    tile('Sales', '₹', thisWeek.orderedProductSales, prevWeek.orderedProductSales, listingQ, 0, false, like),
    tile('Units', 'units', thisWeek.unitsOrdered, prevWeek.unitsOrdered, listingQ, 0, false, like),
    tile('Sessions', 'visits', thisWeek.sessions, prevWeek.sessions, listingQ, 0, false, like),
    tile('Organic CVR', 'pct', cvrThis, cvrPrev, derivedQ, 3, false, like),
    tile('CTR', 'pct', ctrThis, ctrPrev, 'derived', 3, noAds),
    tile('ACOS', 'pct', acosThis, acosPrev, 'derived', 3, noAds),
    tile('TACOS', 'pct', tacosThis, tacosPrev, 'derived', 3, noAds),
    tile('Buy Box %', 'pct', thisWeek.buyBoxWeighted / 100, prevWeek.buyBoxWeighted / 100, listingQ, 3, false, like),
    // Sales − fees − ads − COGS: without COGS this is just "sales minus 22%", which overstates profit.
    tile('Est. Margin', '₹', profitThis, profitPrev, marginDataQuality, 0, thisWeek.cogsMissing, like),
  ]

  const ruleStatus = sqlite.prepare(`
    SELECT severity, COUNT(*) as n FROM alerts WHERE status = 'open' GROUP BY severity
  `).all() as { severity: string; n: number }[]
  const ruleStatusObj = { red: 0, amber: 0 }
  for (const r of ruleStatus) if (r.severity === 'red' || r.severity === 'amber') ruleStatusObj[r.severity] = r.n

  res.json({ as_of: listingDate, tiles, rule_status: ruleStatusObj, cogs: cogsSummary(), robo: edgeAgentHealth(), account_health: latestHealth() ?? null, ads: adsState() })
})

// Inventory & Health page: account health, ad-activity sentinel, and every active listing as Seller Central shows it.
router.get('/v1/account/overview', (_req, res) => {
  const readAt = (sqlite.prepare('SELECT MAX(captured_at) as t FROM fact_listing_snapshot').get() as { t: string | null }).t
  const listings = readAt
    ? (sqlite.prepare(`
        SELECT s.asin, s.sku, s.status, s.fulfilment, s.available, s.inbound, s.price, s.featured_offer_price, s.sales_rank, s.sales_rank_category,
               s.units_sold_30d, s.sales_30d, s.total_fees, s.fba_fee, p.name, p.cogs, p.is_hero
        FROM fact_listing_snapshot s LEFT JOIN dim_product p ON p.asin = s.asin
        WHERE s.captured_at = ? ORDER BY p.is_hero DESC, s.sales_30d DESC, p.name
      `).all(readAt) as any[]).map((l) => ({
        ...l,
        // How long the stock lasts at the last-30-days pace (Amazon's own figures)
        days_of_cover: l.available != null && l.units_sold_30d > 0 ? Math.round((l.available / (l.units_sold_30d / 30)) * 10) / 10 : null,
        // Someone else holds the featured offer at a different price
        featured_offer_differs: l.featured_offer_price != null && l.price != null && Math.abs(l.featured_offer_price - l.price) > 0.5,
      }))
    : []
  res.json({ health: latestHealth() ?? null, ads: adsState(), listings_as_of: readAt, listings })
})

router.get('/v1/dashboard/sku/:sku', (req, res) => {
  const sku = req.params.sku
  const product = sqlite.prepare('SELECT * FROM dim_product WHERE sku = ? AND is_own = 1').get(sku) as any
  if (!product) return res.status(404).json({ error: 'sku not found' })

  const listingSeries = sqlite.prepare(`
    SELECT date, sessions, page_views, buy_box_pct, units_ordered, ordered_product_sales, data_quality
    FROM fact_listing_daily WHERE asin = ? ORDER BY date ASC
  `).all(product.asin)

  const adsSeries = sqlite.prepare(`
    SELECT date, SUM(impressions) impressions, SUM(clicks) clicks, SUM(spend) spend, SUM(ad_orders) ad_orders, SUM(ad_sales) ad_sales
    FROM fact_ads_daily WHERE asin = ? GROUP BY date ORDER BY date ASC
  `).all(product.asin)

  const priceTimeline = sqlite.prepare(`
    SELECT captured_at, price, coupon_deal_flag, bsr, category, rating, review_count, buy_box_seller, data_quality
    FROM fact_price_snapshot WHERE asin = ? ORDER BY captured_at ASC
  `).all(product.asin)

  const keywordRanks = sqlite.prepare(`
    SELECT keyword, date, organic_rank, sponsored_rank, data_quality FROM fact_keyword_rank_daily
    WHERE asin = ? ORDER BY date ASC
  `).all(product.asin)

  const alertHistory = sqlite.prepare(`
    SELECT id, rule_id, title, message, suggested_action, ai_analysis, severity, fired_at, status, evidence_json
    FROM alerts WHERE scope_id = ? OR scope_id = ? ORDER BY fired_at DESC
  `).all(product.asin, product.sku)

  const economics = unitEconomics(product.price, product.fee_per_unit, product.cogs)
  res.json({ product, unit_economics: economics ? { ...economics, cogs_status: cogsStatus(product.cogs, product.cogs_updated_at).status } : null, listing_series: listingSeries, ads_series: adsSeries, price_timeline: priceTimeline, keyword_ranks: keywordRanks, alert_history: alertHistory })
})

router.get('/v1/dashboard/keywords', (_req, res) => {
  const rankDate = latestDate('fact_keyword_rank_daily')
  const keywords = sqlite.prepare('SELECT keyword, is_hero_target FROM dim_keyword ORDER BY keyword').all() as { keyword: string; is_hero_target: number }[]

  const board = keywords.map((k) => {
    const rows = sqlite.prepare(`
      SELECT r.asin, r.organic_rank, r.sponsored_rank, p.name, p.is_own, r.data_quality
      FROM fact_keyword_rank_daily r JOIN dim_product p ON p.asin = r.asin
      WHERE r.keyword = ? AND r.date = ?
      ORDER BY r.organic_rank ASC
    `).all(k.keyword, rankDate)

    const prevDate = rankDate ? daysBefore(rankDate, 7) : null
    const prevRows = prevDate ? sqlite.prepare(`
      SELECT asin, organic_rank FROM fact_keyword_rank_daily WHERE keyword = ? AND date = ?
    `).all(k.keyword, prevDate) as { asin: string; organic_rank: number | null }[] : []
    const prevByAsin = Object.fromEntries(prevRows.map((r) => [r.asin, r.organic_rank]))

    // Share of search: how much of the first page of organic results is yours (latest reading + a week earlier).
    const shareNow = sqlite.prepare('SELECT date, top_n, organic_results, own_organic, sponsored_results, own_sponsored, data_quality FROM fact_search_share WHERE keyword = ? ORDER BY date DESC LIMIT 1').get(k.keyword) as any
    const sharePrev = shareNow
      ? (sqlite.prepare('SELECT own_organic, organic_results FROM fact_search_share WHERE keyword = ? AND date <= ? ORDER BY date DESC LIMIT 1').get(k.keyword, daysBefore(shareNow.date, 5)) as any)
      : null

    return {
      keyword: k.keyword,
      is_hero_target: !!k.is_hero_target,
      share_of_search: shareNow ?? null,
      share_of_search_prev: sharePrev ?? null,
      results: rows.map((r: any) => ({
        ...r,
        is_own: !!r.is_own,
        prev_organic_rank: prevByAsin[r.asin] ?? null,
      })),
    }
  })

  res.json({ as_of: rankDate, board })
})

router.get('/v1/dashboard/competitors', (_req, res) => {
  const own = sqlite.prepare('SELECT * FROM dim_product WHERE is_own = 1').all() as any[]
  const competitors = sqlite.prepare('SELECT * FROM dim_product WHERE is_own = 0').all() as any[]

  const withSnapshots = competitors.map((c) => {
    const snap = sqlite.prepare(`
      SELECT price, coupon_deal_flag, bsr, category, rating, review_count, buy_box_seller, captured_at, data_quality
      FROM fact_price_snapshot WHERE asin = ? ORDER BY captured_at DESC LIMIT 1
    `).get(c.asin)
    return { ...c, is_own: false, latest_snapshot: snap ?? null, review_velocity_7d: reviewVelocity7d(c.asin) }
  })

  res.json({
    own_products: own.map((p) => ({ ...p, is_own: true, review_velocity_7d: reviewVelocity7d(p.asin) })),
    competitors: withSnapshots,
  })
})

router.get('/v1/dashboard/recommendations', (req, res) => {
  const status = (req.query.status as string) ?? 'open'
  const rows = sqlite.prepare(`
    SELECT id, rule_id, scope_type, scope_id, title, message, suggested_action, ai_analysis, evidence_json, severity, fired_at, status
    FROM alerts WHERE status = ? ORDER BY severity = 'red' DESC, fired_at DESC
  `).all(status)
  res.json({ recommendations: rows.map((r: any) => ({ ...r, evidence: JSON.parse(r.evidence_json) })) })
})

router.post('/v1/dashboard/recommendations/:id/:action', (req, res) => {
  const { id, action } = req.params
  const validActions: Record<string, string> = { apply: 'applied', snooze: 'snoozed', dismiss: 'dismissed' }
  const newStatus = validActions[action]
  if (!newStatus) return res.status(400).json({ error: 'invalid action' })

  const result = sqlite.prepare('UPDATE alerts SET status = ? WHERE id = ?').run(newStatus, id)
  if (result.changes === 0) return res.status(404).json({ error: 'alert not found' })
  res.json({ id, status: newStatus })
})

export default router
