import { Router } from 'express'
import { getPlatformMetrics } from '../processors/platform-metrics.js'
import { sqlite } from '../db/client.js'

const router = Router()

// Unified profitability summary for all 4 platforms
router.get('/v1/profitability/all-platforms', (_req, res) => {
  const last30days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const platforms = ['amazon_in', 'meesho', 'snapdeal', 'flipkart']
  const results: any = {}

  for (const marketplace of platforms) {
    const summary = sqlite.prepare(`
      SELECT
        COUNT(DISTINCT sku) as product_count,
        SUM(units_sold) as total_units,
        SUM(gross_revenue) as total_revenue,
        SUM(total_cogs) as total_cogs,
        SUM(total_fees) as total_fees,
        SUM(total_ad_spend) as total_ad_spend,
        SUM(net_profit) as total_profit,
        ROUND(AVG(margin_pct), 1) as avg_margin_pct,
        ROUND(AVG(return_rate) * 100, 1) as avg_return_rate
      FROM metrics_product_profitability
      WHERE calculated_at >= ? AND marketplace = ?
    `).get(last30days, marketplace) as any

    results[marketplace] = {
      product_count: summary?.product_count ?? 0,
      total_units: summary?.total_units ?? 0,
      total_revenue: summary?.total_revenue ?? 0,
      total_cogs: summary?.total_cogs ?? 0,
      total_fees: summary?.total_fees ?? 0,
      total_ad_spend: summary?.total_ad_spend ?? 0,
      total_profit: summary?.total_profit ?? 0,
      avg_margin_pct: summary?.avg_margin_pct ?? 0,
      avg_return_rate: summary?.avg_return_rate ?? 0,
    }
  }

  res.json({
    period: 'last_30_days',
    platforms: results,
    summary: {
      total_products: Object.values(results).reduce((sum: number, p: any) => sum + p.product_count, 0),
      total_revenue: Object.values(results).reduce((sum: number, p: any) => sum + p.total_revenue, 0),
      total_profit: Object.values(results).reduce((sum: number, p: any) => sum + p.total_profit, 0),
    }
  })
})

// Top-level profitability summary across all products (by marketplace)
router.get('/v1/profitability/summary', (req, res) => {
  const marketplace = req.query.marketplace as string || 'amazon_in'
  const last30days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const summary = sqlite.prepare(`
    SELECT
      COUNT(DISTINCT sku) as product_count,
      SUM(units_sold) as total_units,
      SUM(gross_revenue) as total_revenue,
      SUM(total_cogs) as total_cogs,
      SUM(total_fees) as total_fees,
      SUM(total_ad_spend) as total_ad_spend,
      SUM(net_profit) as total_profit,
      ROUND(AVG(margin_pct), 1) as avg_margin_pct,
      ROUND(AVG(return_rate) * 100, 1) as avg_return_rate
    FROM metrics_product_profitability
    WHERE calculated_at >= ? AND marketplace = ?
  `).get(last30days, marketplace) as any

  const topProducts = sqlite.prepare(`
    SELECT
      sku, asin, units_sold, gross_revenue, net_profit, margin_pct, return_rate
    FROM metrics_product_profitability
    WHERE calculated_at >= ? AND marketplace = ?
    ORDER BY net_profit DESC
    LIMIT 10
  `).all(last30days, marketplace) as any[]

  const bottomProducts = sqlite.prepare(`
    SELECT
      sku, asin, units_sold, gross_revenue, net_profit, margin_pct, return_rate
    FROM metrics_product_profitability
    WHERE calculated_at >= ? AND marketplace = ?
    ORDER BY net_profit ASC
    LIMIT 5
  `).all(last30days, marketplace) as any[]

  res.json({
    summary: {
      ...summary,
      avg_margin_pct: summary?.avg_margin_pct ?? 0,
      avg_return_rate: summary?.avg_return_rate ?? 0,
    },
    topProducts: topProducts ?? [],
    bottomProducts: bottomProducts ?? [],
    period: 'last_30_days'
  })
})

// Per-product detailed profitability
router.get('/v1/profitability/product/:sku', (req, res) => {
  const { sku } = req.params

  const product = sqlite.prepare(`
    SELECT sku, asin, gross_revenue, total_cogs, total_fees, total_ad_spend,
           net_profit, margin_pct, units_sold, return_rate, calculated_at
    FROM metrics_product_profitability
    WHERE sku = ?
    ORDER BY calculated_at DESC
    LIMIT 1
  `).get(sku) as any

  const history = sqlite.prepare(`
    SELECT calculated_at, units_sold, gross_revenue, net_profit, margin_pct, return_rate
    FROM metrics_product_profitability
    WHERE sku = ?
    ORDER BY calculated_at DESC
    LIMIT 30
  `).all(sku) as any[]

  const returnDetails = sqlite.prepare(`
    SELECT reason_category, COUNT(*) as count
    FROM fact_return_detail
    WHERE sku = ?
    GROUP BY reason_category
  `).all(sku) as any[]

  res.json({
    product,
    history,
    returnBreakdown: returnDetails ?? [],
  })
})

// Regional performance analysis
router.get('/v1/profitability/regional', (req, res) => {
  const marketplace = req.query.marketplace as string || 'amazon_in'
  const regionMetrics = sqlite.prepare(`
    SELECT
      region, total_orders, total_revenue, return_rate, avg_order_value,
      repeat_customer_rate, top_category
    FROM metrics_regional_performance
    WHERE calculated_at = (SELECT MAX(calculated_at) FROM metrics_regional_performance WHERE marketplace = ?)
    AND marketplace = ?
    ORDER BY total_revenue DESC
  `).all(marketplace, marketplace) as any[]

  res.json({
    regions: regionMetrics ?? [],
    lastUpdated: new Date().toISOString()
  })
})

// Category benchmarking
router.get('/v1/profitability/benchmarks', (_req, res) => {
  const benchmarks = sqlite.prepare(`
    SELECT
      category, your_avg_price, market_avg_price,
      ROUND((your_avg_price - market_avg_price) / market_avg_price * 100, 1) as price_diff_pct,
      your_avg_rating, market_avg_rating,
      your_reviews, market_avg_reviews,
      your_bsr, market_avg_bsr
    FROM metrics_category_benchmark
    WHERE calculated_at = (SELECT MAX(calculated_at) FROM metrics_category_benchmark)
    ORDER BY your_bsr ASC
  `).all() as any[]

  res.json({
    benchmarks: benchmarks ?? [],
    note: 'Positive price_diff_pct = you are more expensive than market average'
  })
})

// Customer LTV and retention analysis
router.get('/v1/profitability/customer-ltv', (req, res) => {
  const marketplace = req.query.marketplace as string || 'amazon_in'
  const cohortRetention = sqlite.prepare(`
    SELECT
      cohort_month,
      CASE
        WHEN month_number = 0 THEN 'Month 0 (Cohort)'
        WHEN month_number = 1 THEN 'Month 1'
        WHEN month_number = 2 THEN 'Month 2'
        WHEN month_number = 3 THEN 'Month 3'
        ELSE 'Month 3+'
      END as period,
      COUNT(*) as customer_count,
      ROUND(AVG(CASE WHEN repeat_customer = 1 THEN 1 ELSE 0 END) * 100, 1) as repeat_rate,
      ROUND(SUM(revenue), 0) as total_revenue,
      ROUND(AVG(revenue), 0) as avg_revenue_per_customer
    FROM fact_customer_repeat
    WHERE cohort_month >= date('now', '-12 months') AND marketplace = ?
    GROUP BY cohort_month, month_number
    ORDER BY cohort_month DESC, month_number ASC
  `).all(marketplace) as any[]

  res.json({
    cohortRetention: cohortRetention ?? [],
    title: 'Customer Cohort Analysis (repeat rate & LTV by signup month)',
  })
})

// Fee breakdown and cost analysis
router.get('/v1/profitability/fees', (_req, res) => {
  const feeBreakdown = sqlite.prepare(`
    SELECT
      'Referral Fees' as fee_type,
      ROUND(SUM(referral_fee_amt), 0) as total_amount,
      ROUND(AVG(referral_fee_pct) * 100, 1) as avg_pct
    FROM fact_settlement
    WHERE settlement_date >= date('now', '-30 days')
    UNION ALL
    SELECT 'FBA Fees', SUM(fba_fee_amt), NULL FROM fact_settlement WHERE settlement_date >= date('now', '-30 days')
    UNION ALL
    SELECT 'Fulfillment Fees', SUM(fulfillment_fee_amt), NULL FROM fact_settlement WHERE settlement_date >= date('now', '-30 days')
    UNION ALL
    SELECT 'Closing Fees', SUM(closing_fee_amt), NULL FROM fact_settlement WHERE settlement_date >= date('now', '-30 days')
    UNION ALL
    SELECT 'Other Fees', SUM(other_fee_amt), NULL FROM fact_settlement WHERE settlement_date >= date('now', '-30 days')
  `).all() as any[]

  res.json({
    feeBreakdown: feeBreakdown ?? [],
    period: 'last_30_days'
  })
})

// Promotional campaign ROI
router.get('/v1/profitability/promotions', (_req, res) => {
  const campaigns = sqlite.prepare(`
    SELECT
      sku, promotion_type, discount_pct, start_date, end_date,
      baseline_revenue, promo_revenue, promo_units, promo_ad_spend,
      ROUND((promo_revenue - baseline_revenue) / baseline_revenue * 100, 1) as revenue_lift_pct,
      ROUND((promo_revenue - promo_ad_spend) / promo_ad_spend, 1) as roi,
      lift_pct
    FROM fact_promotion
    WHERE end_date IS NOT NULL
    ORDER BY start_date DESC
    LIMIT 20
  `).all() as any[]

  res.json({
    campaigns: campaigns ?? [],
    note: 'ROI = (revenue - ad_spend) / ad_spend. Values > 1 are profitable.'
  })
})

// Platform-native traffic & CTR metrics
router.get('/v1/profitability/traffic', (req, res) => {
  const marketplace = (req.query.marketplace as string) || 'amazon_in'
  const m = getPlatformMetrics(marketplace)

  // Amazon-only extras from the Business Report
  let extra: any = {}
  if (marketplace === 'amazon_in') {
    extra = sqlite.prepare(`
      SELECT
        ROUND(SUM(page_views) * 1.0 / NULLIF(SUM(sessions), 0), 2) as pages_per_session,
        ROUND(SUM(buy_box_pct) / COUNT(*), 1) as avg_buy_box_pct,
        COUNT(DISTINCT asin) as unique_products
      FROM fact_listing_daily
      WHERE date >= date('now', '-30 days')
    `).get() as any
  }

  res.json({
    marketplace,
    traffic: {
      impressions: m.impressions,
      clicks: m.clicks,
      ctr_pct: m.ctr_pct,
      cvr_pct: m.cvr_pct,
      ctr_basis: m.ctr_basis,
      cvr_basis: m.cvr_basis,
      traffic_basis: m.traffic_basis,
      pages_per_session: extra?.pages_per_session ?? null,
      buy_box_pct: extra?.avg_buy_box_pct ?? null,
      avg_order_value: m.aov || null,
      total_sales: m.revenue,
      unique_products: extra?.unique_products ?? m.products ?? null,
    },
    source: 'platform_native_data',
    period: marketplace === 'amazon_in' ? 'last_30_days' : 'latest_platform_reading',
  })
})

// Ads performance and CTR
router.get('/v1/profitability/ads', (req, res) => {
  const marketplace = req.query.marketplace as string || 'amazon_in'
  const last30days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const summary = sqlite.prepare(`
    SELECT
      SUM(impressions) as total_impressions,
      SUM(clicks) as total_clicks,
      ROUND(SUM(spend), 0) as total_spend,
      SUM(ad_orders) as total_orders,
      ROUND(SUM(ad_sales), 0) as total_sales,
      ROUND(SUM(clicks) * 100.0 / SUM(impressions), 2) as ctr_pct,
      ROUND(SUM(ad_sales) / NULLIF(SUM(spend), 0), 2) as roas,
      ROUND(SUM(spend) / NULLIF(SUM(ad_orders), 0), 0) as cost_per_order
    FROM fact_ads_daily
    WHERE date >= ? AND asin IN (SELECT DISTINCT asin FROM dim_product WHERE marketplace_code = ?)
  `).get(last30days, marketplace) as any

  const topKeywords = sqlite.prepare(`
    SELECT
      keyword,
      SUM(impressions) as impressions,
      SUM(clicks) as clicks,
      ROUND(SUM(clicks) * 100.0 / SUM(impressions), 2) as ctr_pct,
      SUM(ad_orders) as orders,
      ROUND(SUM(spend), 0) as spend
    FROM fact_ads_daily
    WHERE date >= ? AND keyword IS NOT NULL AND asin IN (SELECT DISTINCT asin FROM dim_product WHERE marketplace_code = ?)
    GROUP BY keyword
    ORDER BY SUM(spend) DESC
    LIMIT 5
  `).all(last30days, marketplace) as any[]

  res.json({
    summary: {
      total_impressions: summary?.total_impressions || 0,
      total_clicks: summary?.total_clicks || 0,
      ctr_pct: summary?.ctr_pct || 0,
      total_spend: summary?.total_spend || 0,
      total_sales: summary?.total_sales || 0,
      roas: summary?.roas || 0,
      cost_per_order: summary?.cost_per_order || 0,
    },
    topKeywords: topKeywords ?? [],
    source: 'ads_data',
    period: 'last_30_days'
  })
})

export default router
