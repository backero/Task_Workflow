import { sqlite } from '../db/client.js'
import { migrate } from '../db/migrate.js'
import { ownProducts, competitorProducts, keywords, keywordAsinMap } from './data.js'
import { runRulesEngine } from '../rules/engine.js'

// Deterministic PRNG so seed data is reproducible across runs.
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(42)
const jitter = (base: number, pct: number) => base * (1 + (rand() - 0.5) * 2 * pct)

const DAYS = 30
function dateAt(offsetFromEnd: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - offsetFromEnd)
  return d.toISOString().slice(0, 10)
}
// offset 0 = oldest day of the 30-day window, offset DAYS-1 = latest (today)
const seriesDates = Array.from({ length: DAYS }, (_, i) => dateAt(DAYS - 1 - i))

migrate()

console.log('[seed] wiping existing data...')
sqlite.exec(`
  DELETE FROM fact_listing_daily; DELETE FROM fact_ads_daily; DELETE FROM fact_price_snapshot;
  DELETE FROM fact_keyword_rank_daily; DELETE FROM fact_inventory_daily; DELETE FROM alerts;
  DELETE FROM ingest_idempotency; DELETE FROM dim_product; DELETE FROM dim_keyword;
  DELETE FROM dim_campaign; DELETE FROM dim_marketplace; DELETE FROM connections;
`)

console.log('[seed] dims...')
sqlite.prepare('INSERT INTO dim_marketplace (code, name) VALUES (?, ?)').run('amazon_in', 'Amazon India')

const insertProduct = sqlite.prepare(`
  INSERT INTO dim_product (asin, sku, name, category, marketplace_code, price, cogs, cogs_updated_at, watches_asin, is_hero, is_own)
  VALUES (@asin, @sku, @name, @category, 'amazon_in', @price, @cogs, @cogsUpdatedAt, @watchesAsin, @isHero, @isOwn)
`)
for (const p of [...ownProducts, ...competitorProducts]) {
  insertProduct.run({
    asin: p.asin, sku: p.sku, name: p.name, category: p.category,
    price: p.price, cogs: p.cogs, cogsUpdatedAt: p.cogs != null ? dateAt(5) : null,
    watchesAsin: p.watchesAsin ?? null,
    isHero: p.isHero ? 1 : 0, isOwn: p.isOwn ? 1 : 0,
  })
}

const insertKeyword = sqlite.prepare('INSERT INTO dim_keyword (keyword, is_hero_target) VALUES (?, ?)')
for (const k of keywords) {
  insertKeyword.run(k.keyword, k.isHeroTarget ? 1 : 0)
}

const campaigns = [
  { campaignId: 'CAMP-VITC-SP', name: 'Vitamin C Serum — Sponsored Products', type: 'sponsored_products' },
  { campaignId: 'CAMP-RETN-SP', name: 'Retinol Night Cream — Sponsored Products', type: 'sponsored_products' },
  { campaignId: 'CAMP-NIAC-SP', name: 'Niacinamide Serum — Sponsored Products', type: 'sponsored_products' },
  { campaignId: 'CAMP-HYAL-SP', name: 'Hyaluronic Acid Serum — Sponsored Products', type: 'sponsored_products' },
]
const insertCampaign = sqlite.prepare('INSERT INTO dim_campaign (campaign_id, name, type) VALUES (@campaignId, @name, @type)')
for (const c of campaigns) {
  insertCampaign.run(c)
}

console.log('[seed] listing + ads + inventory daily...')

const insertListing = sqlite.prepare(`
  INSERT INTO fact_listing_daily (asin, date, sessions, page_views, buy_box_pct, units_ordered, ordered_product_sales, data_quality)
  VALUES (@asin, @date, @sessions, @pageViews, @buyBoxPct, @unitsOrdered, @orderedProductSales, 'api')
`)
const insertAds = sqlite.prepare(`
  INSERT INTO fact_ads_daily (campaign_id, keyword, asin, date, impressions, clicks, spend, ad_orders, ad_sales, data_quality)
  VALUES (@campaignId, '', @asin, @date, @impressions, @clicks, @spend, @adOrders, @adSales, 'api')
`)
const insertInventory = sqlite.prepare(`
  INSERT INTO fact_inventory_daily (sku, date, available, days_of_cover, data_quality)
  VALUES (@sku, @date, @available, @daysOfCover, 'api')
`)

type ProductPlan = {
  asin: string; sku: string; price: number
  baseSessions: number; baseCvr: number
  campaignId?: string; baseAdSpendPerSession?: number; adCvrMult?: number
  lastWeekSessionsMult?: number // visitors guard trigger
  lastWeekCvrMult?: number      // conversion guard trigger
  lastDayBuyBox?: number        // buy box guard trigger
  lastNDaysAcosBleed?: boolean  // ad bleed guard trigger
  adDependent?: boolean         // ad dependence guard trigger
  lowStockEnd?: boolean         // stock guard trigger
  baseInventory: number
}

const plans: ProductPlan[] = [
  { asin: 'B0A1VITC30', sku: 'SERUM-VITC-30', price: 599, baseSessions: 460, baseCvr: 0.07, campaignId: 'CAMP-VITC-SP', baseAdSpendPerSession: 0.15, adCvrMult: 1, lastDayBuyBox: 82, baseInventory: 900 },
  { asin: 'B0A1RETN50', sku: 'CREAM-RETINOL-50', price: 799, baseSessions: 300, baseCvr: 0.05, campaignId: 'CAMP-RETN-SP', baseAdSpendPerSession: 0.2, adCvrMult: 1, lastNDaysAcosBleed: true, lowStockEnd: true, baseInventory: 380 },
  { asin: 'B0A1HYAL30', sku: 'SERUM-HA-30', price: 549, baseSessions: 250, baseCvr: 0.072, campaignId: 'CAMP-HYAL-SP', baseAdSpendPerSession: 0.08, adCvrMult: 1, lastWeekCvrMult: 0.55, baseInventory: 700 },
  { asin: 'B0A1NIAC30', sku: 'SERUM-NIA-30', price: 499, baseSessions: 300, baseCvr: 0.06, campaignId: 'CAMP-NIAC-SP', baseAdSpendPerSession: 0.35, adCvrMult: 1.4, lastWeekSessionsMult: 0.6, adDependent: true, baseInventory: 650 },
  { asin: 'B0A1ALOE100', sku: 'GEL-ALOE-100', price: 349, baseSessions: 220, baseCvr: 0.08, baseInventory: 800 },
  { asin: 'B0A1EYEC20', sku: 'CREAM-EYE-20', price: 449, baseSessions: 180, baseCvr: 0.065, baseInventory: 500 },
]

for (const plan of plans) {
  let inventory = plan.baseInventory

  seriesDates.forEach((date, i) => {
    const isLastDay = i === DAYS - 1
    const inLastWeek = i >= DAYS - 7
    const inLastNForAcos = i >= DAYS - 3

    let sessions = Math.round(jitter(plan.baseSessions, 0.15))
    if (inLastWeek && plan.lastWeekSessionsMult) sessions = Math.round(sessions * plan.lastWeekSessionsMult)
    const pageViews = Math.round(sessions * jitter(1.3, 0.05))

    let cvr = jitter(plan.baseCvr, 0.1)
    if (inLastWeek && plan.lastWeekCvrMult) cvr *= plan.lastWeekCvrMult
    const unitsOrdered = Math.max(0, Math.round(sessions * cvr))
    const orderedProductSales = Number((unitsOrdered * plan.price).toFixed(2))

    let buyBoxPct = jitter(97.5, 0.02)
    if (isLastDay && plan.lastDayBuyBox != null) buyBoxPct = plan.lastDayBuyBox
    buyBoxPct = Math.min(100, Math.max(0, Number(buyBoxPct.toFixed(1))))

    insertListing.run({ asin: plan.asin, date, sessions, pageViews, buyBoxPct, unitsOrdered, orderedProductSales })

    if (plan.campaignId) {
      const impressions = Math.round(jitter(sessions * 8, 0.2))
      let clicks = Math.round(impressions * jitter(0.03, 0.15))
      const spendPerClick = jitter(6, 0.15)
      let spend = Number((clicks * spendPerClick).toFixed(2))
      let adCvr = jitter(plan.baseCvr * (plan.adCvrMult ?? 1), 0.15)
      let adOrders = Math.max(0, Math.round(clicks * adCvr))
      let adSales = Number((adOrders * plan.price).toFixed(2))

      if (plan.lastNDaysAcosBleed && inLastNForAcos) {
        // force spend well above breakeven ACOS for 3 straight days, but keep ad_sales > 0
        adOrders = Math.max(1, Math.round(adOrders * 0.5))
        adSales = Number((adOrders * plan.price).toFixed(2))
        spend = Number((adSales * jitter(0.75, 0.08)).toFixed(2)) // ~75% ACOS, above ~45% breakeven
      }
      if (plan.adDependent && inLastWeek) {
        spend = Number((spend * 2.2).toFixed(2))
        adOrders = Math.round(adOrders * 1.8)
        adSales = Number((adOrders * plan.price).toFixed(2))
      }

      insertAds.run({ campaignId: plan.campaignId, asin: plan.asin, date, impressions, clicks, spend, adOrders, adSales })
    }

    // inventory: gentle drawdown by units sold, occasional restock, forced low at the end for the stock-guard SKU
    inventory = Math.max(0, inventory - unitsOrdered + (i % 9 === 0 ? Math.round(plan.baseInventory * 0.05) : 0))
    const avgDaily = Math.max(1, plan.baseSessions * plan.baseCvr)
    let daysOfCover = Number((inventory / avgDaily).toFixed(1))
    if (isLastDay && plan.lowStockEnd) {
      daysOfCover = 9.2
      inventory = Math.round(avgDaily * daysOfCover)
    }
    insertInventory.run({ sku: plan.sku, date, available: inventory, daysOfCover })
  })
}

console.log('[seed] price / BSR / rating snapshots...')
const insertPrice = sqlite.prepare(`
  INSERT INTO fact_price_snapshot (asin, captured_at, price, coupon_deal_flag, bsr, category, rating, review_count, data_quality)
  VALUES (@asin, @capturedAt, @price, @couponDealFlag, @bsr, @category, @rating, @reviewCount, @dataQuality)
`)

const SNAPSHOT_DAYS = 10
const snapshotDates = Array.from({ length: SNAPSHOT_DAYS }, (_, i) => dateAt(SNAPSHOT_DAYS - 1 - i))

const priceQualityByAsin: Record<string, string> = {} // own -> 'api' (their own price via SP-API pricing), competitors -> 'observed'

for (const p of ownProducts) priceQualityByAsin[p.asin] = 'api'
for (const p of competitorProducts) priceQualityByAsin[p.asin] = 'observed'

const dealCompetitorAsins = new Set(['B0C1GLOWLAB1', 'B0C1SKINRITUAL1']) // trigger Deal Guard against VITC + RETN hero SKUs

for (const p of [...ownProducts, ...competitorProducts]) {
  let bsr = Math.round(jitter(1500, 0.3))
  let rating = p.isOwn ? 4.5 : Number(jitter(4.3, 0.05).toFixed(1))
  let reviewCount = Math.round(jitter(p.isOwn ? 850 : 500, 0.1))

  snapshotDates.forEach((capturedAtDate, i) => {
    const isLast = i === snapshotDates.length - 1
    const isSecondLast = i === snapshotDates.length - 2
    bsr = Math.max(1, Math.round(bsr + (rand() - 0.5) * 60))
    reviewCount += Math.round(rand() * 4)

    if (p.asin === 'B0A1VITC30' && isSecondLast) rating = 4.5
    if (p.asin === 'B0A1VITC30' && isLast) rating = 4.3 // Stars Guard trigger: -0.2

    const couponDealFlag = (isLast && dealCompetitorAsins.has(p.asin)) ? 1 : 0
    let price = p.price
    if (p.asin === 'B0C1GLOWLAB1' && isLast) price = 549 // stays below VITC's 599 -> Price Guard

    insertPrice.run({
      asin: p.asin,
      capturedAt: `${capturedAtDate}T09:00:00+05:30`,
      price,
      couponDealFlag,
      bsr,
      category: p.category,
      rating,
      reviewCount,
      dataQuality: priceQualityByAsin[p.asin],
    })
  })
}

console.log('[seed] keyword ranks...')
const insertRank = sqlite.prepare(`
  INSERT INTO fact_keyword_rank_daily (keyword, asin, date, organic_rank, sponsored_rank, data_quality)
  VALUES (@keyword, @asin, @date, @organicRank, @sponsoredRank, 'observed')
`)

const rankDates = seriesDates.slice(-14) // last 14 days of rank history is enough for the keyword board + WoW compare

for (const [keyword, asins] of Object.entries(keywordAsinMap)) {
  for (const asin of asins) {
    let baseRank = Math.round(jitter(6, 0.3))
    rankDates.forEach((date, i) => {
      const isLast = i === rankDates.length - 1
      baseRank = Math.max(1, Math.round(baseRank + (rand() - 0.5) * 2))
      let organicRank = baseRank
      if (keyword === 'retinol night cream' && asin === 'B0A1RETN50' && isLast) organicRank = 14 // Search Rank Guard
      const sponsoredRank = Math.max(1, Math.round(organicRank * 0.6))
      insertRank.run({ keyword, asin, date, organicRank, sponsoredRank })
    })
  }
  // also give a couple of competitor ASINs a rank for the same keyword so the board has rivals to
  // compare — use the explicit watchlist mapping (same fix as Price/Deal Guard), not category,
  // so an "aloe vera" keyword doesn't pull in retinol-cream rivals just because both are moisturizers
  const targetAsins = new Set(keywordAsinMap[keyword] ?? [])
  const rivalPool = competitorProducts.filter((c) => c.watchesAsin && targetAsins.has(c.watchesAsin))
  for (const rival of rivalPool.slice(0, 2)) {
    let baseRank = Math.round(jitter(9, 0.4))
    rankDates.forEach((date) => {
      baseRank = Math.max(1, Math.round(baseRank + (rand() - 0.5) * 2))
      insertRank.run({ keyword, asin: rival.asin, date, organicRank: baseRank, sponsoredRank: null })
    })
  }
}

console.log('[seed] connections...')
sqlite.prepare(`
  INSERT INTO connections (source, status, last_seen_at, updated_at) VALUES ('edge_agent', 'healthy', ?, ?)
`).run(new Date().toISOString(), new Date().toISOString())
sqlite.prepare(`INSERT INTO connections (source, status) VALUES ('spapi', 'not_connected')`).run()
sqlite.prepare(`INSERT INTO connections (source, status) VALUES ('ads_api', 'not_connected')`).run()

console.log('[seed] running rules engine for initial recommendations...')
const alertCount = runRulesEngine()

console.log(`[seed] done. ${DAYS} days of history, ${ownProducts.length} own SKUs, ${competitorProducts.length} competitor ASINs, ${keywords.length} keywords, ${alertCount} alerts fired.`)
