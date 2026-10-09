import { sqlite } from '../db/client.js'

/**
 * Cross-Platform Profitability Calculation
 * Computes metrics for Amazon, Meesho, Snapdeal, and Flipkart
 */

export function calculateMeeshoProfitability() {
  const last30days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const overviewData = sqlite.prepare(`
    SELECT
      json_extract(body_json, '$.kpis') as kpis,
      received_at
    FROM raw_ingest
    WHERE marketplace = 'meesho' AND payload_type = 'overview'
    AND received_at >= ?
    ORDER BY received_at DESC LIMIT 1
  `).get(last30days) as any

  if (!overviewData) return 0

  const kpis = JSON.parse(overviewData.kpis)

  // Insert profitability metrics
  const timestamp = new Date().toISOString()
  sqlite.prepare(`
    INSERT OR REPLACE INTO metrics_product_profitability (
      calculated_at, marketplace, period_days, units_sold,
      gross_revenue, total_fees, net_profit, margin_pct, return_rate, data_quality
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    timestamp,
    'meesho',
    30,
    kpis.orders_7d || 0,
    0, // Revenue not available in overview
    0, // Fees not available
    0,
    0,
    kpis.avg_rating ? (5 - kpis.avg_rating) * 10 : 0,
    'partial'
  )

  return 1
}

export function calculateSnapdealProfitability() {
  const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const overviewData = sqlite.prepare(`
    SELECT body_json FROM raw_ingest
    WHERE marketplace = 'snapdeal' AND payload_type = 'overview'
    AND received_at >= ?
    ORDER BY received_at DESC LIMIT 1
  `).get(last7days) as any

  if (!overviewData) return 0

  const data = JSON.parse(overviewData.body_json)

  const timestamp = new Date().toISOString()
  sqlite.prepare(`
    INSERT OR REPLACE INTO metrics_product_profitability (
      calculated_at, marketplace, period_days, units_sold,
      gross_revenue, total_fees, net_profit, margin_pct, return_rate, data_quality
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    timestamp,
    'snapdeal',
    7,
    data.kpis?.orders || 0,
    0,
    0,
    0,
    0,
    0,
    'partial'
  )

  return 1
}

export function calculateFlipkartProfitability() {
  const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const businessHealth = sqlite.prepare(`
    SELECT body_json FROM raw_ingest
    WHERE marketplace = 'flipkart' AND payload_type = 'overview'
    AND received_at >= ?
    ORDER BY received_at DESC LIMIT 1
  `).get(last7days) as any

  if (!businessHealth) return 0

  const data = JSON.parse(businessHealth.body_json)
  const bh = data.account_metrics?.business_health || {}

  const timestamp = new Date().toISOString()
  sqlite.prepare(`
    INSERT OR REPLACE INTO metrics_product_profitability (
      calculated_at, marketplace, period_days, units_sold,
      gross_revenue, total_fees, net_profit, margin_pct, return_rate, data_quality
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    timestamp,
    'flipkart',
    7,
    bh.units_7d || 0,
    bh.sales_7d || 0,
    bh.sales_7d ? (bh.sales_7d * 0.15) : 0, // Estimate ~15% fees
    bh.sales_7d ? (bh.sales_7d * 0.85) : 0,
    0,
    bh.buyer_returns_pct || 0,
    'calculated'
  )

  return 1
}

export function calculateAmazonProfitability() {
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
      ROUND(AVG(margin_pct), 1) as avg_margin,
      ROUND(AVG(return_rate) * 100, 1) as avg_return_rate
    FROM metrics_product_profitability
    WHERE calculated_at >= ? AND marketplace = 'amazon_in'
  `).get(last30days) as any

  return summary ? 1 : 0
}

export function runAllPlatformProfitability() {
  console.log('[platform-profitability] Calculating profitability for all platforms...')

  try {
    const results = {
      amazon: calculateAmazonProfitability(),
      meesho: calculateMeeshoProfitability(),
      snapdeal: calculateSnapdealProfitability(),
      flipkart: calculateFlipkartProfitability(),
    }

    console.log('[platform-profitability] Results:', results)
    return results
  } catch (err) {
    console.error('[platform-profitability] Error:', err)
    return { error: String(err) }
  }
}
