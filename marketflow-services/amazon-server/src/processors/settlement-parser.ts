import { sqlite } from '../db/client.js'

// Amazon Settlement Report Parser
// Takes raw settlement data and calculates profitability metrics

export function parseAmazonSettlements() {
  const settlements = sqlite.prepare(`
    SELECT id, body_json FROM raw_ingest
    WHERE source = 'edge_agent' AND payload_type = 'settlement'
    AND received_at >= datetime('now', '-90 days')
  `).all() as any[]

  let parsed = 0
  for (const settlement of settlements) {
    try {
      const data = JSON.parse(settlement.body_json)
      if (!Array.isArray(data)) continue

      for (const row of data) {
        const settlementId = `amazon_settlement_${row.settlement_id}_${row.order_id || 'bulk'}`

        sqlite.prepare(`
          INSERT OR REPLACE INTO fact_settlement (
            id, marketplace, settlement_date, order_id, sku,
            units, gross_amount, referral_fee_pct, referral_fee_amt,
            fba_fee_amt, fulfillment_fee_amt, closing_fee_amt, other_fee_amt,
            net_amount, data_quality
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          settlementId,
          'amazon_in',
          row.settlement_date || new Date().toISOString().split('T')[0],
          row.order_id || null,
          row.sku || null,
          row.quantity || 1,
          row.gross_amount || 0,
          row.referral_fee_pct ? row.referral_fee_pct / 100 : null,
          row.referral_fee || 0,
          row.fba_fee || 0,
          row.fulfillment_fee || 0,
          row.closing_fee || 0,
          (row.other_fees || 0),
          (row.gross_amount || 0) - (row.referral_fee || 0) - (row.fba_fee || 0) - (row.fulfillment_fee || 0) - (row.closing_fee || 0) - (row.other_fees || 0),
          'api'
        )
        parsed++
      }
    } catch (e) {
      console.error('[settlement-parser] Failed to parse settlement:', e)
    }
  }

  return parsed
}

// Calculate daily profitability metrics from orders and settlements
export function calculateProfitabilityMetrics(marketplaces: string[] = ['amazon_in']) {
  const lastCalc = sqlite.prepare(`
    SELECT MAX(calculated_at) as last FROM metrics_product_profitability
  `).get() as any

  // Only recalculate if data changed or daily calc due
  const last = lastCalc?.last ? new Date(lastCalc.last) : new Date(0)
  const now = new Date()
  const daysSinceCalc = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)

  if (daysSinceCalc < 1) return 0

  let calculated = 0
  const period = 30 // 30-day rolling window

  for (const marketplace of marketplaces) {
    const products = sqlite.prepare(`
      SELECT DISTINCT sku, asin FROM dim_product WHERE marketplace_code = ?
    `).all(marketplace) as any[]

    for (const product of products) {
      const cutoff = new Date(now.getTime() - period * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const metrics = sqlite.prepare(`
        SELECT
          COUNT(DISTINCT order_id) as units_sold,
          SUM(order_price - COALESCE(discount_amount, 0)) as gross_revenue,
          SUM(COALESCE(referral_fee, 0) + COALESCE(platform_fee, 0) + COALESCE(fulfillment_fee, 0) + COALESCE(other_fees, 0)) as total_fees,
          SUM(COALESCE(ad_spend, 0)) as total_ad_spend,
          COUNT(CASE WHEN return_flag = 1 THEN 1 END) as return_count
        FROM fact_order
        WHERE sku = ? AND marketplace = ? AND order_date >= ?
      `).get(product.sku, marketplace, cutoff) as any

      const cogs = sqlite.prepare(`
        SELECT cogs FROM dim_product WHERE sku = ?
      `).get(product.sku) as any

      const cogsValue = cogs?.cogs || 0
      const unitsTotal = metrics?.units_sold || 0
      const grossRevenue = metrics?.gross_revenue || 0
      const totalCogs = unitsTotal * cogsValue
      const totalFees = metrics?.total_fees || 0
      const adSpend = metrics?.total_ad_spend || 0
      const returns = metrics?.return_count || 0

      const netProfit = grossRevenue - totalCogs - totalFees - adSpend
      const marginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0
      const returnRate = unitsTotal > 0 ? returns / unitsTotal : 0
      const roi = (adSpend > 0) ? ((netProfit / adSpend) * 100) : 0

      sqlite.prepare(`
        INSERT INTO metrics_product_profitability (
          calculated_at, marketplace, asin, sku, period_days,
          units_sold, gross_revenue, total_cogs, total_fees,
          total_ad_spend, total_returns, net_profit, margin_pct, roi_pct,
          return_rate, data_quality
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        now.toISOString(),
        marketplace,
        product.asin,
        product.sku,
        period,
        unitsTotal,
        grossRevenue,
        totalCogs,
        totalFees,
        adSpend,
        returns,
        netProfit,
        marginPct,
        roi,
        returnRate,
        'calculated'
      )
      calculated++
    }
  }

  return calculated
}

// Analyze returns by reason and category
export function categorizeReturns() {
  const reasons: Record<string, string> = {
    'defective': 'defective',
    'not_as_described': 'not_as_described',
    'wrong_item': 'wrong_item',
    'damaged': 'damaged',
    'not_needed': 'not_needed',
    'duplicate': 'duplicate',
    'wrong_size': 'wrong_size',
    'unwanted': 'unwanted',
    'quality': 'quality',
    'broken': 'defective',
    'dead': 'defective',
    'doesn\'t work': 'defective',
    'cheap': 'quality',
    'poor quality': 'quality',
    'not as mentioned': 'not_as_described',
    'false advertising': 'not_as_described',
  }

  const returns = sqlite.prepare(`
    SELECT id, sku, return_reason FROM fact_return_detail WHERE reason_category IS NULL
  `).all() as any[]

  let categorized = 0
  for (const ret of returns) {
    const lower = (ret.return_reason || '').toLowerCase()
    let category = 'other'

    for (const [key, val] of Object.entries(reasons)) {
      if (lower.includes(key)) {
        category = val
        break
      }
    }

    sqlite.prepare(`UPDATE fact_return_detail SET reason_category = ? WHERE id = ?`)
      .run(category, ret.id)
    categorized++
  }

  return categorized
}

// Track customer repeat rates and LTV
export function calculateCustomerCohorts() {
  // Identify distinct customers and their purchase history
  const customers = sqlite.prepare(`
    SELECT DISTINCT customer_id, MIN(order_date) as first_purchase
    FROM fact_order
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
  `).all() as any[]

  let cohorts = 0
  for (const cust of customers) {
    const cohorMonth = new Date(cust.first_purchase).toISOString().slice(0, 7) // YYYY-MM

    sqlite.prepare(`
      INSERT OR IGNORE INTO dim_customer_cohort (
        marketplace, cohort_month, first_purchase_date
      ) VALUES (?, ?, ?)
    `).run('all_platforms', cohorMonth, cust.first_purchase)

    // Track repeat purchases by month
    const orders = sqlite.prepare(`
      SELECT
        DATE(order_date, '+1 month', '-1 day') as month,
        COUNT(*) as orders,
        SUM(order_price - COALESCE(discount_amount, 0)) as revenue
      FROM fact_order
      WHERE customer_id = ? AND order_date >= ?
      GROUP BY month
    `).all(cust.customer_id, cust.first_purchase) as any[]

    let monthNumber = 0
    for (const order of orders) {
      const isRepeat = monthNumber > 0 ? 1 : 0
      sqlite.prepare(`
        INSERT INTO fact_customer_repeat (
          marketplace, customer_id, cohort_month, month,
          month_number, orders, revenue, repeat_customer
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'all_platforms',
        cust.customer_id,
        cohorMonth,
        order.month,
        monthNumber,
        order.orders,
        order.revenue,
        isRepeat
      )
      monthNumber++
    }
    cohorts++
  }

  return cohorts
}

export function runAllProcessors() {
  console.log('[processors] Starting settlement and profitability calculations...')

  const parsed = parseAmazonSettlements()
  console.log(`[processors] Parsed ${parsed} settlement records`)

  const metrics = calculateProfitabilityMetrics(['amazon_in', 'meesho', 'snapdeal', 'flipkart_in'])
  console.log(`[processors] Calculated profitability for ${metrics} product-days`)

  const categorized = categorizeReturns()
  console.log(`[processors] Categorized ${categorized} returns`)

  const cohorts = calculateCustomerCohorts()
  console.log(`[processors] Updated ${cohorts} customer cohorts`)

  return { parsed, metrics, categorized, cohorts }
}
