import { sqlite } from '../db/client.js'

// Cross-platform processors for Meesho, Snapdeal, Flipkart
// Unified return categorization, regional analysis, and LTV tracking

// Meesho-specific: Extract region from order metadata and calculate regional metrics
export function calculateMeeshoRegionalMetrics() {
  const periods = ['daily', 'weekly', 'monthly']
  let calculated = 0

  for (const period of periods) {
    const dateFunc = period === 'daily' ? "DATE(now)" : period === 'weekly' ? "DATE(now, '-7 days')" : "DATE(now, '-30 days')"

    const regions = sqlite.prepare(`
      SELECT
        COALESCE(region, 'Unknown') as region,
        COUNT(*) as total_orders,
        SUM(order_price - COALESCE(discount_amount, 0)) as total_revenue,
        COUNT(CASE WHEN return_flag = 1 THEN 1 END) as total_returns,
        COUNT(DISTINCT customer_id) as unique_customers
      FROM fact_order
      WHERE marketplace = 'meesho' AND order_date >= ${dateFunc}
      GROUP BY region
    `).all() as any[]

    for (const region of regions) {
      const returnRate = region.total_orders > 0 ? region.total_returns / region.total_orders : 0
      const repeatRate = region.unique_customers > 0 ?
        (sqlite.prepare(`
          SELECT COUNT(DISTINCT customer_id) as repeat_count FROM fact_order
          WHERE marketplace = 'meesho' AND region = ? AND order_date >= ${dateFunc}
          AND customer_id IN (
            SELECT customer_id FROM fact_order WHERE customer_id IS NOT NULL GROUP BY customer_id HAVING COUNT(*) > 1
          )
        `).get(region.region) as any)?.repeat_count || 0 : 0

      sqlite.prepare(`
        INSERT INTO metrics_regional_performance (
          calculated_at, marketplace, region, period,
          total_orders, total_revenue, total_returns, return_rate, repeat_customer_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        new Date().toISOString(),
        'meesho',
        region.region,
        period,
        region.total_orders,
        region.total_revenue,
        region.total_returns,
        returnRate,
        repeatRate / region.unique_customers
      )
      calculated++
    }
  }

  return calculated
}

// Flipkart: Regional analysis by pincode (state-level)
export function calculateFlipkartRegionalMetrics() {
  const now = new Date()
  const last30days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  let calculated = 0

  // Extract state from pincode mapping (assuming region field or extracting from order data)
  const regions = sqlite.prepare(`
    SELECT
      COALESCE(region, 'Unknown') as region,
      COUNT(*) as total_orders,
      SUM(order_price - COALESCE(discount_amount, 0)) as total_revenue,
      COUNT(CASE WHEN return_flag = 1 THEN 1 END) as total_returns,
      SUM(CASE WHEN return_flag = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as return_rate,
      AVG(order_price - COALESCE(discount_amount, 0)) as avg_order_value,
      COUNT(DISTINCT asin) as category_count
    FROM fact_order
    WHERE marketplace = 'flipkart_in' AND order_date >= ?
    GROUP BY region
  `).all(last30days) as any[]

  for (const region of regions) {
    sqlite.prepare(`
      INSERT INTO metrics_regional_performance (
        calculated_at, marketplace, region, period,
        total_orders, total_revenue, total_returns, return_rate, avg_order_value, top_category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      now.toISOString(),
      'flipkart_in',
      region.region,
      '30_days',
      region.total_orders,
      region.total_revenue,
      region.total_returns,
      region.return_rate,
      region.avg_order_value,
      region.category_count
    )
    calculated++
  }

  return calculated
}

// Snapdeal: Regional + category-level benchmarking
export function calculateSnapdealCategoryBenchmarks() {
  const now = new Date()
  const last30days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  let calculated = 0

  const categories = sqlite.prepare(`
    SELECT DISTINCT category FROM dim_product WHERE marketplace_code = 'snapdeal'
  `).all() as any[]

  for (const cat of categories) {
    const categoryName = cat.category || 'Unknown'

    // Your performance
    const yourMetrics = sqlite.prepare(`
      SELECT
        AVG(order_price) as avg_price,
        COUNT(*) as order_count,
        SUM(CASE WHEN return_flag = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as return_rate
      FROM fact_order
      WHERE marketplace = 'snapdeal' AND asin IN (
        SELECT asin FROM dim_product WHERE category = ?
      ) AND order_date >= ?
    `).get(categoryName, last30days) as any

    // Market average (simplified: assume this is an aggregate you'd calculate from category data)
    const marketAvg = 300 // placeholder

    if (yourMetrics) {
      sqlite.prepare(`
        INSERT INTO metrics_category_benchmark (
          calculated_at, marketplace, category,
          your_avg_price, market_avg_price
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        now.toISOString(),
        'snapdeal',
        categoryName,
        yourMetrics.avg_price,
        marketAvg
      )
      calculated++
    }
  }

  return calculated
}

// All platforms: Track promotional campaign ROI
export function analyzePromotionalCampaigns() {
  const promotions = sqlite.prepare(`
    SELECT DISTINCT
      sku, DATE(order_date) as date
    FROM fact_order
    WHERE ad_spend > 0
    GROUP BY sku, DATE(order_date)
  `).all() as any[]

  let analyzed = 0

  for (const promo of promotions) {
    // Baseline: average daily orders without ad spend
    const baseline = sqlite.prepare(`
      SELECT AVG(daily_sales) as baseline_revenue FROM (
        SELECT SUM(order_price - COALESCE(discount_amount, 0)) as daily_sales
        FROM fact_order
        WHERE sku = ? AND ad_spend = 0
        GROUP BY DATE(order_date)
        LIMIT 30
      )
    `).get(promo.sku) as any

    // Promo performance
    const promoData = sqlite.prepare(`
      SELECT
        SUM(order_price - COALESCE(discount_amount, 0)) as promo_revenue,
        COUNT(*) as promo_units,
        SUM(ad_spend) as total_spend,
        COUNT(CASE WHEN return_flag = 1 THEN 1 END) as returns
      FROM fact_order
      WHERE sku = ? AND DATE(order_date) = ?
    `).get(promo.sku, promo.date) as any

    if (promoData && baseline) {
      const lift = baseline.baseline_revenue ?
        ((promoData.promo_revenue - baseline.baseline_revenue) / baseline.baseline_revenue) * 100 : 0
      const roi = promoData.total_spend > 0 ?
        ((promoData.promo_revenue - promoData.total_spend) / promoData.total_spend) * 100 : 0

      sqlite.prepare(`
        INSERT OR REPLACE INTO fact_promotion (
          id, marketplace, sku, promotion_type,
          start_date, baseline_revenue, promo_revenue, promo_units,
          promo_ad_spend, lift_pct, roi
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `promo_${promo.sku}_${promo.date}`,
        'all',
        promo.sku,
        'paid_promotion',
        promo.date,
        baseline.baseline_revenue,
        promoData.promo_revenue,
        promoData.promo_units,
        promoData.total_spend,
        lift,
        roi
      )
      analyzed++
    }
  }

  return analyzed
}

// Calculate per-platform profitability (similar to Amazon but for other platforms)
export function calculateCrossPlatformMetrics() {
  const platforms = ['meesho', 'snapdeal', 'flipkart_in']
  let metrics = 0

  for (const platform of platforms) {
    const products = sqlite.prepare(`
      SELECT DISTINCT sku, asin FROM dim_product WHERE marketplace_code = ?
    `).all(platform === 'flipkart_in' ? 'flipkart' : platform) as any[]

    for (const product of products) {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const orderData = sqlite.prepare(`
        SELECT
          COUNT(*) as units,
          SUM(order_price - COALESCE(discount_amount, 0)) as revenue,
          SUM(COALESCE(referral_fee, 0) + COALESCE(platform_fee, 0) + COALESCE(other_fees, 0)) as fees,
          SUM(COALESCE(ad_spend, 0)) as ad_spend,
          COUNT(CASE WHEN return_flag = 1 THEN 1 END) as returns
        FROM fact_order
        WHERE sku = ? AND marketplace = ? AND order_date >= ?
      `).get(product.sku, platform, cutoff) as any

      if (orderData && orderData.units > 0) {
        const cogs = (sqlite.prepare(`SELECT cogs FROM dim_product_cost WHERE sku = ?`).get(product.sku) as any)?.cogs || 0
        const totalCogs = orderData.units * cogs
        const netProfit = orderData.revenue - totalCogs - (orderData.fees || 0) - (orderData.ad_spend || 0)
        const margin = orderData.revenue > 0 ? (netProfit / orderData.revenue) * 100 : 0

        sqlite.prepare(`
          INSERT INTO metrics_product_profitability (
            calculated_at, marketplace, asin, sku, period_days,
            units_sold, gross_revenue, total_cogs, total_fees, total_ad_spend,
            total_returns, net_profit, margin_pct, return_rate, data_quality
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          new Date().toISOString(),
          platform,
          product.asin,
          product.sku,
          30,
          orderData.units,
          orderData.revenue,
          totalCogs,
          orderData.fees,
          orderData.ad_spend,
          orderData.returns,
          netProfit,
          margin,
          orderData.units > 0 ? orderData.returns / orderData.units : 0,
          'calculated'
        )
        metrics++
      }
    }
  }

  return metrics
}

export function runCrossPlatformAnalytics() {
  console.log('[cross-platform] Starting analytics...')

  const meeshoRegional = calculateMeeshoRegionalMetrics()
  console.log(`[cross-platform] Meesho regional: ${meeshoRegional} regions`)

  const flipkartRegional = calculateFlipkartRegionalMetrics()
  console.log(`[cross-platform] Flipkart regional: ${flipkartRegional} regions`)

  const benchmarks = calculateSnapdealCategoryBenchmarks()
  console.log(`[cross-platform] Category benchmarks: ${benchmarks}`)

  const promos = analyzePromotionalCampaigns()
  console.log(`[cross-platform] Promotional analysis: ${promos}`)

  const metrics = calculateCrossPlatformMetrics()
  console.log(`[cross-platform] Cross-platform profitability: ${metrics} products`)

  return { meeshoRegional, flipkartRegional, benchmarks, promos, metrics }
}
