import { sqlite } from '../db/client.js'
import * as jev from '../ai/jevClient.js'

// Previously called Claude Opus (the priciest tier) for a narrative paragraph on every run.
// Jev, TypeSafe's System One model (docs.typesafe.ai), answers typed yes/no (noul), choice
// and score questions with probabilities instead of writing prose, which is both cheaper
// and a better fit for "what's right or wrong here" sales-manager-style judgment calls.
// Silently no-ops until TYPESAFE_API_KEY is set.
if (!process.env.TYPESAFE_API_KEY) {
  console.warn('[ai-insights] Warning: TYPESAFE_API_KEY not set. AI insights will be skipped. Set env var to enable.')
}

const PROFITABILITY_QUESTIONS = {
  pricing_action: jev.noul("Based on this 30-day profitability summary, should any product's price be increased this week?"),
  quality_risk: jev.noul('Based on the return-rate data, is product quality currently a risk to profitability?'),
  fee_risk: jev.noul('Based on the fees-vs-revenue data, are platform fees currently eating too much of the margin?'),
  urgency: jev.score('How urgent is it to act on this data this week?', [
    'No action needed',
    'Worth a look this week',
    'Should act soon',
    'Urgent — act now',
  ]),
  priority_area: jev.choice('Which single area most needs attention right now?', {
    pricing: 'Price optimization',
    quality_or_returns: 'Product quality or high returns',
    platform_fees: 'Platform fee ratio',
    slow_moving_inventory: 'Slow-moving stock',
    top_product_scaling: 'Scaling the best-performing products',
  }),
}

// Generate AI insights on profitability data
export async function generateProfitabilityInsights() {
  const last30days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Fetch current profitability data
  const summary = sqlite.prepare(`
    SELECT
      COUNT(DISTINCT sku) as products,
      SUM(units_sold) as units,
      SUM(gross_revenue) as revenue,
      SUM(total_cogs) as cogs,
      SUM(total_fees) as fees,
      SUM(net_profit) as profit,
      AVG(margin_pct) as avg_margin,
      AVG(return_rate) as avg_return_rate
    FROM metrics_product_profitability
    WHERE calculated_at >= ?
  `).get(last30days) as any

  const topProducts = sqlite.prepare(`
    SELECT sku, units_sold, net_profit, margin_pct, return_rate
    FROM metrics_product_profitability
    WHERE calculated_at >= ?
    ORDER BY net_profit DESC LIMIT 3
  `).all(last30days) as any[]

  const bottomProducts = sqlite.prepare(`
    SELECT sku, units_sold, net_profit, margin_pct, return_rate
    FROM metrics_product_profitability
    WHERE calculated_at >= ?
    ORDER BY net_profit ASC LIMIT 3
  `).all(last30days) as any[]

  const highReturnProducts = sqlite.prepare(`
    SELECT sku, units_sold, return_rate, net_profit
    FROM metrics_product_profitability
    WHERE calculated_at >= ? AND return_rate > 0.05
    ORDER BY return_rate DESC LIMIT 3
  `).all(last30days) as any[]

  try {
    if (!jev.isConfigured()) throw new Error('TYPESAFE_API_KEY not set')
    const predictions = await jev.ask(
      { summary, topProducts, bottomProducts, highReturnProducts },
      PROFITABILITY_QUESTIONS,
    )
    const insight = JSON.stringify(predictions)

    // Store AI insight
    sqlite.prepare(`
      INSERT INTO ai_insights (
        generated_at, insight_type, marketplace, summary_json, recommendations,
        data_quality, confidence_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      'profitability_analysis',
      'cross_platform',
      JSON.stringify({ summary, topProducts, bottomProducts, highReturnProducts }),
      insight,
      'ai_generated',
      0.85
    )

    return { success: true, insight, generatedAt: new Date().toISOString() }
  } catch (error) {
    console.error('[ai-insights] Failed to generate insights:', error)
    return { success: false, error: String(error) }
  }
}

// Create table for AI insights if it doesn't exist
export function createAiInsightsTable() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ai_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL,
      insight_type TEXT NOT NULL,
      marketplace TEXT,
      summary_json TEXT,
      recommendations TEXT,
      data_quality TEXT,
      confidence_score REAL,
      user_feedback TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ai_insights_time ON ai_insights(generated_at DESC);
  `)
}

// Generate alerts based on thresholds
export async function generateAutomatedAlerts() {
  const now = new Date()
  const alerts = []

  // Alert 1: Negative margin products
  const negativeMargin = sqlite.prepare(`
    SELECT sku, asin, margin_pct, net_profit FROM metrics_product_profitability
    WHERE margin_pct < 0 AND calculated_at >= datetime('now', '-1 day')
  `).all() as any[]

  for (const product of negativeMargin) {
    alerts.push({
      rule_id: 'negative_margin',
      severity: 'red',
      title: `Losing money on ${product.sku}`,
      message: `Product has -${Math.abs(product.margin_pct).toFixed(1)}% margin (₹${product.net_profit.toFixed(0)} loss)`,
      action: 'Increase price by 10-15% or reduce COGS. Check pricing vs competitors.',
      sku: product.sku,
    })
  }

  // Alert 2: High return rate
  const highReturns = sqlite.prepare(`
    SELECT sku, asin, return_rate FROM metrics_product_profitability
    WHERE return_rate > 0.10 AND calculated_at >= datetime('now', '-1 day')
  `).all() as any[]

  for (const product of highReturns) {
    alerts.push({
      rule_id: 'high_return_rate',
      severity: 'red',
      title: `Quality issue: ${product.sku} has ${(product.return_rate * 100).toFixed(0)}% returns`,
      message: `This exceeds healthy 3-5% benchmark`,
      action: 'Investigate return reasons. Check QC, shipping packaging, or product description accuracy.',
      sku: product.sku,
    })
  }

  // Alert 3: Low margin opportunity
  const lowMargin = sqlite.prepare(`
    SELECT sku, margin_pct, units_sold FROM metrics_product_profitability
    WHERE margin_pct > 0 AND margin_pct < 10 AND units_sold > 10 AND calculated_at >= datetime('now', '-1 day')
  `).all() as any[]

  for (const product of lowMargin) {
    alerts.push({
      rule_id: 'low_margin_optimization',
      severity: 'amber',
      title: `${product.sku}: Low margin but high volume (${product.units_sold} units)`,
      message: `Only ${product.margin_pct.toFixed(1)}% margin - opportunity to increase`,
      action: 'Small 5-10% price increase could add significant profit without losing much volume',
      sku: product.sku,
    })
  }

  // Alert 4: Inventory risk (slow movers)
  const slowMovers = sqlite.prepare(`
    SELECT sku FROM metrics_product_profitability
    WHERE units_sold < 3 AND calculated_at >= datetime('now', '-7 days')
    GROUP BY sku HAVING COUNT(*) = 7
  `).all() as any[]

  for (const product of slowMovers) {
    alerts.push({
      rule_id: 'slow_moving_stock',
      severity: 'amber',
      title: `${product.sku}: Slow-moving (< 3 units/day for 7 days)`,
      message: `Risk of inventory aging and storage cost buildup`,
      action: 'Consider flash sale, bundle with popular items, or discontinue if COGS is high',
      sku: product.sku,
    })
  }

  // Alert 5: Platform fee spike
  const feeSummary = sqlite.prepare(`
    SELECT
      SUM(total_fees) as total_fees,
      SUM(gross_revenue) as revenue
    FROM metrics_product_profitability
    WHERE calculated_at >= datetime('now', '-1 day')
  `).get() as any

  if (feeSummary && feeSummary.revenue > 0) {
    const feeRatio = feeSummary.total_fees / feeSummary.revenue
    if (feeRatio > 0.35) { // > 35% of revenue
      alerts.push({
        rule_id: 'high_fee_ratio',
        severity: 'amber',
        title: `Fees consuming ${(feeRatio * 100).toFixed(1)}% of revenue`,
        message: `This is above healthy 25-30% range. Check fee structure across platforms.`,
        action: 'Review which platform is charging most. Optimize assortment to lower-fee categories.',
      })
    }
  }

  // Store alerts
  for (const alert of alerts) {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    sqlite.prepare(`
      INSERT INTO alerts (
        id, rule_id, scope_type, scope_id, title, message, suggested_action,
        evidence_json, severity, fired_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alertId,
      alert.rule_id,
      'product',
      alert.sku || 'all',
      alert.title,
      alert.message,
      alert.action,
      JSON.stringify(alert),
      alert.severity,
      now.toISOString(),
      'open'
    )
  }

  return { alertsGenerated: alerts.length, alerts }
}

// Get recent alerts
export function getRecentAlerts(limit = 20) {
  return sqlite.prepare(`
    SELECT * FROM alerts
    WHERE status = 'open'
    ORDER BY fired_at DESC
    LIMIT ?
  `).all(limit) as any[]
}

// Get AI insights
export function getLatestInsights(limit = 5) {
  return sqlite.prepare(`
    SELECT * FROM ai_insights
    ORDER BY generated_at DESC
    LIMIT ?
  `).all(limit) as any[]
}
