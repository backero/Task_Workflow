import { Router } from 'express'
import { z } from 'zod'
import { sqlite, withTransaction } from '../db/client.js'
import { runRulesEngine } from '../rules/engine.js'
import { ensureOwnProduct } from '../catalog.js'
import { storeRawPayload, flagUnknownMetrics } from '../lib/rawStore.js'
import { deriveDaysOfCover } from '../inventory.js'

const router = Router()

const INGEST_API_KEY = process.env.INGEST_API_KEY ?? 'mcc-demo-ingest-key'

// source -> data_quality mapping (Design Doc §6 / Addendum v1.1 §4)
const sourceDataQuality: Record<string, string> = {
  spapi_poller: 'api',
  ads_api_poller: 'api',
  chrome_extension: 'observed',
  edge_agent: 'observed',
  manual_import: 'api',
  // Range totals spread evenly across days — an approximation, never a true daily figure.
  business_report_import: 'estimate',
}

const recordSchema = z.object({
  asin: z.string().optional(),
  sku: z.string().optional(),
  keyword: z.string().optional(),
  campaign_id: z.string().optional(),
  date: z.string().optional(),
  captured_at: z.string().optional(),
  metrics: z.record(z.union([z.number(), z.string(), z.boolean(), z.null()])),
})

const bodySchema = z.object({
  source: z.string(),
  marketplace: z.string(),
  captured_at: z.string(),
  payload_type: z.enum([
    'listing_daily', 'ads_daily', 'price_snapshot', 'keyword_rank', 'inventory_daily',
    'account_health', 'ads_summary', 'inventory_listing', 'search_share',
  ]),
  records: z.array(recordSchema).min(1).max(1000),
})

const upsertListing = sqlite.prepare(`
  INSERT INTO fact_listing_daily (asin, date, sessions, page_views, buy_box_pct, units_ordered, ordered_product_sales, data_quality)
  VALUES (@asin, @date, @sessions, @pageViews, @buyBoxPct, @unitsOrdered, @orderedProductSales, @dataQuality)
  ON CONFLICT(asin, date) DO UPDATE SET
    sessions = excluded.sessions, page_views = excluded.page_views, buy_box_pct = excluded.buy_box_pct,
    units_ordered = excluded.units_ordered, ordered_product_sales = excluded.ordered_product_sales, data_quality = excluded.data_quality
`)

const upsertAds = sqlite.prepare(`
  INSERT INTO fact_ads_daily (campaign_id, keyword, asin, date, impressions, clicks, spend, ad_orders, ad_sales, data_quality)
  VALUES (@campaignId, @keyword, @asin, @date, @impressions, @clicks, @spend, @adOrders, @adSales, @dataQuality)
  ON CONFLICT(campaign_id, keyword, asin, date) DO UPDATE SET
    impressions = excluded.impressions, clicks = excluded.clicks, spend = excluded.spend,
    ad_orders = excluded.ad_orders, ad_sales = excluded.ad_sales, data_quality = excluded.data_quality
`)

const insertPrice = sqlite.prepare(`
  INSERT INTO fact_price_snapshot (asin, captured_at, price, coupon_deal_flag, bsr, category, rating, review_count, buy_box_seller, data_quality)
  VALUES (@asin, @capturedAt, @price, @couponDealFlag, @bsr, @category, @rating, @reviewCount, @buyBoxSeller, @dataQuality)
`)

// A rival added by ASIN only is named after its ASIN until Robo first reads its page.
const nameFromTitle = sqlite.prepare('UPDATE dim_product SET name = ? WHERE asin = ? AND name = asin')

const fillMissingOwnPrice = sqlite.prepare('UPDATE dim_product SET price = ? WHERE asin = ? AND price IS NULL AND is_own = 1')

const upsertRank = sqlite.prepare(`
  INSERT INTO fact_keyword_rank_daily (keyword, asin, date, organic_rank, sponsored_rank, data_quality)
  VALUES (@keyword, @asin, @date, @organicRank, @sponsoredRank, @dataQuality)
  ON CONFLICT(keyword, asin, date) DO UPDATE SET
    organic_rank = excluded.organic_rank, sponsored_rank = excluded.sponsored_rank, data_quality = excluded.data_quality
`)

const upsertInventory = sqlite.prepare(`
  INSERT INTO fact_inventory_daily (sku, date, available, days_of_cover, data_quality)
  VALUES (@sku, @date, @available, @daysOfCover, @dataQuality)
  ON CONFLICT(sku, date) DO UPDATE SET
    available = excluded.available, days_of_cover = excluded.days_of_cover, data_quality = excluded.data_quality
`)

const upsertShare = sqlite.prepare(`
  INSERT INTO fact_search_share (keyword, date, top_n, organic_results, own_organic, sponsored_results, own_sponsored, data_quality)
  VALUES (@keyword, @date, @topN, @organicResults, @ownOrganic, @sponsoredResults, @ownSponsored, @dataQuality)
  ON CONFLICT(keyword, date) DO UPDATE SET
    top_n = excluded.top_n, organic_results = excluded.organic_results, own_organic = excluded.own_organic,
    sponsored_results = excluded.sponsored_results, own_sponsored = excluded.own_sponsored, data_quality = excluded.data_quality
`)

const insertHealth = sqlite.prepare(`
  INSERT INTO fact_account_health (
    captured_at, at_risk, banner, ahr,
    odr_fbm_pct, odr_fbm_defects, odr_fbm_orders, odr_target_pct, odr_fba_pct, odr_fba_defects, odr_fba_orders,
    late_dispatch_pct, late_dispatch_late, late_dispatch_orders, late_dispatch_target_pct,
    cancel_pct, cancel_count, cancel_orders, cancel_target_pct, valid_tracking_pct, policy_issues, emergency_contact_verified, data_quality
  ) VALUES (
    @capturedAt, @atRisk, @banner, @ahr,
    @odrFbmPct, @odrFbmDefects, @odrFbmOrders, @odrTargetPct, @odrFbaPct, @odrFbaDefects, @odrFbaOrders,
    @ldPct, @ldLate, @ldOrders, @ldTarget,
    @cancelPct, @cancelCount, @cancelOrders, @cancelTarget, @validTracking, @policyIssues, @contactVerified, @dataQuality
  )
`)

const insertAdsSummary = sqlite.prepare(`
  INSERT INTO fact_ads_summary (captured_at, range_label, impressions, clicks, sales, data_quality)
  VALUES (@capturedAt, @rangeLabel, @impressions, @clicks, @sales, @dataQuality)
`)

const insertListingSnapshot = sqlite.prepare(`
  INSERT INTO fact_listing_snapshot (
    captured_at, asin, sku, status, fulfilment, available, inbound, unfulfillable, price, featured_offer_price,
    sales_rank, sales_rank_category, units_sold_30d, sales_30d, total_fees, fba_fee, data_quality
  ) VALUES (
    @capturedAt, @asin, @sku, @status, @fulfilment, @available, @inbound, @unfulfillable, @price, @featuredOfferPrice,
    @salesRank, @salesRankCategory, @unitsSold30d, @sales30d, @totalFees, @fbaFee, @dataQuality
  )
`)

// Keep the catalog in step with what Seller Central shows: the real SKU replaces the ASIN stand-in,
// and for FBA listings the estimated all-in fee per unit is kept (it drives real margin).
const syncProductFromListing = sqlite.prepare(`
  UPDATE dim_product SET
    sku = CASE WHEN @sku IS NOT NULL AND sku = asin THEN @sku ELSE sku END,
    fulfilment = COALESCE(@fulfilment, fulfilment),
    fee_per_unit = CASE WHEN @fee IS NOT NULL THEN @fee ELSE fee_per_unit END
  WHERE asin = @asin AND is_own = 1
`)

const numOrNull = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
/** The seller's calendar day for a timestamp (stock is a daily figure; the server runs on the seller's clock). */
const localDay = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const insertIdempotency = sqlite.prepare('INSERT INTO ingest_idempotency (idempotency_key, received_at) VALUES (?, ?)')

router.post('/v1/ingest', (req, res) => {
  const authHeader = req.header('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (token !== INGEST_API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const idempotencyKey = req.header('idempotency-key')
  if (idempotencyKey) {
    const existing = sqlite.prepare('SELECT idempotency_key FROM ingest_idempotency WHERE idempotency_key = ?').get(idempotencyKey)
    if (existing) {
      return res.status(202).json({ accepted: 0, rejected: 0, errors: [], duplicate: true })
    }
  }

  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ accepted: 0, rejected: 0, errors: parsed.error.issues })
  }

  const { source, payload_type, records } = parsed.data
  const dataQuality = sourceDataQuality[source] ?? 'observed'
  const errors: string[] = []
  let accepted = 0

  withTransaction(() => {
    storeRawPayload(parsed.data, idempotencyKey)
    for (const rec of records) {
      try {
        flagUnknownMetrics(payload_type, rec.metrics)
        switch (payload_type) {
          case 'listing_daily': {
            if (!rec.asin || !rec.date) throw new Error('asin and date required')
            const m = rec.metrics
            if (typeof m.title === 'string' && m.title) {
              const units = Number(m.units_ordered ?? 0)
              const sales = Number(m.ordered_product_sales ?? 0)
              ensureOwnProduct(rec.asin, m.title, units > 0 ? Math.round(sales / units) : null)
            }
            upsertListing.run({
              asin: rec.asin, date: rec.date,
              sessions: Number(m.sessions ?? 0), pageViews: Number(m.page_views ?? 0),
              buyBoxPct: Number(m.buy_box_pct ?? 0), unitsOrdered: Number(m.units_ordered ?? 0),
              orderedProductSales: Number(m.ordered_product_sales ?? 0), dataQuality,
            })
            break
          }
          case 'ads_daily': {
            if (!rec.asin || !rec.date || !rec.campaign_id) throw new Error('asin, date, campaign_id required')
            const m = rec.metrics
            upsertAds.run({
              campaignId: rec.campaign_id, keyword: rec.keyword ?? '', asin: rec.asin, date: rec.date,
              impressions: Number(m.impressions ?? 0), clicks: Number(m.clicks ?? 0), spend: Number(m.spend ?? 0),
              adOrders: Number(m.ad_orders ?? 0), adSales: Number(m.ad_sales ?? 0), dataQuality,
            })
            break
          }
          case 'price_snapshot': {
            if (!rec.asin) throw new Error('asin required')
            const m = rec.metrics
            insertPrice.run({
              asin: rec.asin, capturedAt: rec.captured_at ?? parsed.data.captured_at,
              price: Number(m.price ?? 0), couponDealFlag: m.coupon_deal_flag ? 1 : 0,
              bsr: m.bsr != null ? Number(m.bsr) : null, category: (m.category as string) ?? null,
              rating: m.rating != null ? Number(m.rating) : null,
              reviewCount: m.review_count != null ? Number(m.review_count) : null,
              buyBoxSeller: typeof m.buy_box_seller === 'string' && m.buy_box_seller ? m.buy_box_seller : null, dataQuality,
            })
            // Listings auto-registered from a Business Report have no price until they sell; the
            // storefront price seen here fills that gap (never overwrites a price already set).
            if (Number(m.price) > 0) fillMissingOwnPrice.run(Number(m.price), rec.asin)
            if (typeof m.title === 'string' && m.title) nameFromTitle.run(m.title.split(' | ')[0].slice(0, 110), rec.asin)
            break
          }
          case 'keyword_rank': {
            if (!rec.keyword || !rec.asin || !rec.date) throw new Error('keyword, asin, date required')
            const m = rec.metrics
            upsertRank.run({
              keyword: rec.keyword, asin: rec.asin, date: rec.date,
              organicRank: m.organic_rank != null ? Number(m.organic_rank) : null,
              sponsoredRank: m.sponsored_rank != null ? Number(m.sponsored_rank) : null, dataQuality,
            })
            break
          }
          case 'account_health': {
            const m = rec.metrics
            insertHealth.run({
              capturedAt: rec.captured_at ?? parsed.data.captured_at, atRisk: m.at_risk ? 1 : 0, banner: strOrNull(m.banner), ahr: numOrNull(m.ahr),
              odrFbmPct: numOrNull(m.odr_fbm_pct), odrFbmDefects: numOrNull(m.odr_fbm_defects), odrFbmOrders: numOrNull(m.odr_fbm_orders),
              odrTargetPct: numOrNull(m.odr_target_pct), odrFbaPct: numOrNull(m.odr_fba_pct), odrFbaDefects: numOrNull(m.odr_fba_defects),
              odrFbaOrders: numOrNull(m.odr_fba_orders), ldPct: numOrNull(m.late_dispatch_pct), ldLate: numOrNull(m.late_dispatch_late),
              ldOrders: numOrNull(m.late_dispatch_orders), ldTarget: numOrNull(m.late_dispatch_target_pct), cancelPct: numOrNull(m.cancel_pct),
              cancelCount: numOrNull(m.cancel_count), cancelOrders: numOrNull(m.cancel_orders), cancelTarget: numOrNull(m.cancel_target_pct),
              validTracking: numOrNull(m.valid_tracking_pct), policyIssues: numOrNull(m.policy_issues),
              contactVerified: m.emergency_contact_verified == null ? null : m.emergency_contact_verified ? 1 : 0, dataQuality,
            })
            break
          }
          case 'search_share': {
            if (!rec.keyword || !rec.date) throw new Error('keyword and date required')
            const m = rec.metrics
            upsertShare.run({
              keyword: rec.keyword, date: rec.date, topN: Number(m.top_n ?? 0), organicResults: Number(m.organic_results ?? 0),
              ownOrganic: Number(m.own_organic ?? 0), sponsoredResults: Number(m.sponsored_results ?? 0), ownSponsored: Number(m.own_sponsored ?? 0), dataQuality,
            })
            break
          }
          case 'ads_summary': {
            const m = rec.metrics
            insertAdsSummary.run({
              capturedAt: rec.captured_at ?? parsed.data.captured_at, rangeLabel: strOrNull(m.range_label),
              impressions: Number(m.impressions ?? 0), clicks: Number(m.clicks ?? 0), sales: Number(m.sales ?? 0), dataQuality,
            })
            break
          }
          case 'inventory_listing': {
            if (!rec.asin) throw new Error('asin required')
            const m = rec.metrics
            const capturedAt = rec.captured_at ?? parsed.data.captured_at
            const available = numOrNull(m.available)
            const fulfilment = strOrNull(m.fulfilment)
            const unitsSold30d = numOrNull(m.units_sold_30d)
            if (typeof m.title === 'string' && m.title) ensureOwnProduct(rec.asin, m.title, numOrNull(m.price))
            insertListingSnapshot.run({
              capturedAt, asin: rec.asin, sku: rec.sku ?? null, status: strOrNull(m.status), fulfilment, available, inbound: numOrNull(m.inbound),
              unfulfillable: numOrNull(m.unfulfillable), price: numOrNull(m.price), featuredOfferPrice: numOrNull(m.featured_offer_price),
              salesRank: numOrNull(m.sales_rank), salesRankCategory: strOrNull(m.sales_rank_category), unitsSold30d,
              sales30d: numOrNull(m.sales_30d), totalFees: numOrNull(m.total_fees), fbaFee: numOrNull(m.fba_fee), dataQuality,
            })
            syncProductFromListing.run({
              asin: rec.asin, sku: rec.sku ?? null, fulfilment,
              fee: fulfilment === 'FBA' ? numOrNull(m.total_fees) : null,
            })
            // Daily stock figure. Days of cover uses Amazon's own 30-day units sold — real, and available from day one,
            // unlike a rolling window over our (still short) history.
            if (rec.sku && available != null) {
              const cover = unitsSold30d != null && unitsSold30d > 0 ? available / (unitsSold30d / 30) : null
              upsertInventory.run({ sku: rec.sku, date: localDay(capturedAt), available, daysOfCover: cover, dataQuality })
            }
            break
          }
          case 'inventory_daily': {
            if (!rec.sku || !rec.date) throw new Error('sku and date required')
            const m = rec.metrics
            upsertInventory.run({
              sku: rec.sku, date: rec.date, available: Number(m.available ?? 0),
              // Amazon's inventory endpoint gives quantity only — derive cover from recent real sales.
              daysOfCover: m.days_of_cover != null ? Number(m.days_of_cover) : deriveDaysOfCover(rec.sku, rec.date, Number(m.available ?? 0)), dataQuality,
            })
            break
          }
        }
        accepted += 1
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'unknown error')
      }
    }

    if (idempotencyKey) {
      insertIdempotency.run(idempotencyKey, new Date().toISOString())
    }
  })

  runRulesEngine()

  res.status(202).json({ accepted, rejected: errors.length, errors })
})

// The flag half of "stored but flagged": metric names that arrived with no matching column.
router.get('/v1/ingest/unknown-metrics', (_req, res) => {
  res.json({
    unknown_metrics: sqlite.prepare(
      'SELECT payload_type, metric_key, seen_count, last_value, first_seen_at, last_seen_at FROM unknown_metrics ORDER BY last_seen_at DESC',
    ).all(),
  })
})

export default router
