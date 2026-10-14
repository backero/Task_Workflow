import { sqlite } from '../db/client.js'

// Collect settlement data from raw ingest
export function collectSettlementData() {
  const settlements = sqlite.prepare(`
    SELECT id, body_json FROM raw_ingest
    WHERE payload_type IN ('settlement', 'order_settlement')
    AND received_at >= datetime('now', '-30 days')
    AND id NOT IN (SELECT DISTINCT body_json FROM fact_settlement LIMIT 1)
  `).all() as any[]

  let collected = 0
  for (const settlement of settlements) {
    try {
      const data = Array.isArray(JSON.parse(settlement.body_json)) ?
        JSON.parse(settlement.body_json) : [JSON.parse(settlement.body_json)]

      for (const row of data) {
        sqlite.prepare(`
          INSERT OR IGNORE INTO fact_settlement (
            id, marketplace, settlement_date, order_id, sku,
            units, gross_amount, referral_fee_pct, referral_fee_amt,
            fba_fee_amt, fulfillment_fee_amt, closing_fee_amt, other_fee_amt,
            net_amount, data_quality
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `settlement_${row.settlement_id || row.order_id}_${Date.now()}`,
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
          row.other_fees || 0,
          (row.gross_amount || 0) - (row.referral_fee || 0) - (row.fba_fee || 0) - (row.fulfillment_fee || 0),
          'api'
        )
        collected++
      }
    } catch (e) {
      // Silently skip malformed records
    }
  }
  return collected
}

// Extract order data and ingest into fact_order
export function collectOrderData() {
  const orders = sqlite.prepare(`
    SELECT DISTINCT body_json FROM raw_ingest
    WHERE payload_type = 'order'
    AND received_at >= datetime('now', '-30 days')
  `).all() as any[]

  let collected = 0
  for (const order of orders) {
    try {
      const data = Array.isArray(JSON.parse(order.body_json)) ?
        JSON.parse(order.body_json) : [JSON.parse(order.body_json)]

      for (const row of data) {
        const orderId = row.order_id || `order_${Date.now()}`

        sqlite.prepare(`
          INSERT OR IGNORE INTO fact_order (
            id, marketplace, order_date, asin, sku, quantity,
            order_price, discount_amount, ad_spend, referral_fee,
            platform_fee, other_fees, return_flag, return_reason,
            customer_segment, region, data_quality
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          orderId,
          row.marketplace || 'amazon_in',
          row.order_date || new Date().toISOString().split('T')[0],
          row.asin || null,
          row.sku || null,
          row.quantity || 1,
          row.order_price || 0,
          row.discount_amount || 0,
          row.ad_spend || 0,
          row.referral_fee || 0,
          row.platform_fee || 0,
          row.other_fees || 0,
          row.return_flag ? 1 : 0,
          row.return_reason || null,
          row.customer_segment || 'unknown',
          row.pincode ? extractState(row.pincode) : row.region || 'unknown',
          'api'
        )
        collected++
      }
    } catch (e) {
      // Silently skip malformed records
    }
  }
  return collected
}

// Extract state from pincode (Indian postal codes)
function extractState(pincode: string): string {
  if (!pincode) return 'unknown'

  const pincodeStateMap: Record<string, string> = {
    // Major cities/states (simplified mapping)
    '400000': 'Maharashtra', '401000': 'Maharashtra',
    '560000': 'Karnataka', '560001': 'Karnataka',
    '600000': 'Tamil Nadu', '600001': 'Tamil Nadu',
    '700000': 'West Bengal', '700001': 'West Bengal',
    '110000': 'Delhi', '110001': 'Delhi',
    '380000': 'Gujarat', '380001': 'Gujarat',
    '500000': 'Telangana', '500001': 'Telangana',
  }

  // Try exact match first
  if (pincodeStateMap[pincode]) return pincodeStateMap[pincode]

  // Try prefix match (first 3 digits)
  const prefix = pincode.substring(0, 3)
  for (const [pin, state] of Object.entries(pincodeStateMap)) {
    if (pin.startsWith(prefix)) return state
  }

  return 'other'
}

// Categorize return reasons
export function categorizeReturnReasons() {
  const reasons: Record<string, string> = {
    'defective': 'quality', 'damaged': 'quality', 'broken': 'quality', 'dead': 'quality',
    'not_as_described': 'description', 'false_advertising': 'description', 'wrong_item': 'wrong_item',
    'wrong_size': 'sizing', 'doesn\'t fit': 'sizing',
    'not_needed': 'buyer_regret', 'unwanted': 'buyer_regret', 'duplicate': 'buyer_regret',
    'better_price': 'price', 'found_cheaper': 'price',
  }

  const returns = sqlite.prepare(`
    SELECT id, return_reason FROM fact_return_detail
    WHERE reason_category IS NULL AND return_reason IS NOT NULL
    LIMIT 1000
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

// Deduplicate customers for LTV tracking
export function deduplicateCustomers() {
  // Find orders from same customer
  const customerGroups = sqlite.prepare(`
    SELECT
      LOWER(COALESCE(customer_id, email)) as customer_key,
      COUNT(*) as order_count,
      MIN(order_date) as first_order,
      MAX(order_date) as last_order,
      SUM(order_price - COALESCE(discount_amount, 0)) as lifetime_value
    FROM fact_order
    WHERE customer_id IS NOT NULL OR email IS NOT NULL
    GROUP BY customer_key
    HAVING order_count > 1
  `).all() as any[]

  let deduped = 0
  for (const group of customerGroups) {
    // Mark repeat customers
    sqlite.prepare(`
      UPDATE fact_order
      SET customer_segment = 'repeat'
      WHERE LOWER(COALESCE(customer_id, email)) = ?
      AND order_date > ?
    `).run(group.customer_key, group.first_order)
    deduped += group.order_count
  }

  return deduped
}

// Extract regional data from orders
export function extractRegionalData() {
  const regions = sqlite.prepare(`
    SELECT
      COALESCE(region, 'unknown') as region,
      marketplace,
      COUNT(*) as total_orders,
      SUM(order_price - COALESCE(discount_amount, 0)) as total_revenue,
      COUNT(CASE WHEN return_flag = 1 THEN 1 END) as returns
    FROM fact_order
    WHERE order_date >= datetime('now', '-30 days')
    GROUP BY region, marketplace
  `).all() as any[]

  let extracted = 0
  const now = new Date()

  for (const region of regions) {
    sqlite.prepare(`
      INSERT OR REPLACE INTO metrics_regional_performance (
        calculated_at, marketplace, region, period,
        total_orders, total_revenue, total_returns, return_rate, avg_order_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      now.toISOString(),
      region.marketplace,
      region.region,
      '30_days',
      region.total_orders,
      region.total_revenue,
      region.returns,
      region.total_orders > 0 ? region.returns / region.total_orders : 0,
      region.total_orders > 0 ? region.total_revenue / region.total_orders : 0
    )
    extracted++
  }

  return extracted
}

// Run all collectors
export function runDataCollectors() {
  console.log('[data-collectors] Starting high-priority data collection...')

  const settlements = collectSettlementData()
  console.log(`[data-collectors] Settlement records: ${settlements}`)

  const orders = collectOrderData()
  console.log(`[data-collectors] Order records: ${orders}`)

  const returns = categorizeReturnReasons()
  console.log(`[data-collectors] Return reasons categorized: ${returns}`)

  const customers = deduplicateCustomers()
  console.log(`[data-collectors] Customers deduplicated: ${customers}`)

  const regions = extractRegionalData()
  console.log(`[data-collectors] Regional data extracted: ${regions}`)

  return { settlements, orders, returns, customers, regions }
}
