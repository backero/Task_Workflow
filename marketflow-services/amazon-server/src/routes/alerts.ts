import { Router } from 'express'
import { sqlite } from '../db/client.js'
import { getRecentAlerts, getLatestInsights } from '../processors/ai-insights.js'

const router = Router()

// Get all open alerts across all platforms
router.get('/v1/alerts/all-platforms', (_req, res) => {
  const platforms = ['amazon_in', 'meesho', 'snapdeal', 'flipkart']
  const allAlerts: any = {}

  for (const marketplace of platforms) {
    const alerts = sqlite.prepare(`
      SELECT id, rule_id, title, message, suggested_action, severity, fired_at, scope_id
      FROM alerts
      WHERE status = 'open' AND marketplace = ?
      ORDER BY
        CASE severity WHEN 'red' THEN 1 WHEN 'amber' THEN 2 ELSE 3 END,
        fired_at DESC
    `).all(marketplace) as any[]

    allAlerts[marketplace] = {
      total: alerts.length,
      critical: alerts.filter(a => a.severity === 'red').length,
      warnings: alerts.filter(a => a.severity === 'amber').length,
      alerts: alerts.slice(0, 10), // Top 10 per platform
    }
  }

  const totalAlerts = Object.values(allAlerts).reduce((sum: number, p: any) => sum + p.total, 0)
  const totalCritical = Object.values(allAlerts).reduce((sum: number, p: any) => sum + p.critical, 0)

  res.json({
    total_alerts: totalAlerts,
    total_critical: totalCritical,
    platforms: allAlerts,
  })
})

// Get alerts for specific marketplace
router.get('/v1/alerts', (req, res) => {
  const marketplace = req.query.marketplace as string || 'amazon_in'
  const alerts = sqlite.prepare(`
    SELECT id, rule_id, title, message, suggested_action, severity, fired_at, scope_id
    FROM alerts
    WHERE status = 'open' AND marketplace = ?
    ORDER BY
      CASE severity WHEN 'red' THEN 1 WHEN 'amber' THEN 2 ELSE 3 END,
      fired_at DESC
  `).all(marketplace) as any[]

  res.json({
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'red').length,
    warnings: alerts.filter(a => a.severity === 'amber').length,
    alerts,
  })
})

// Get alerts by severity
router.get('/v1/alerts/severity/:level', (req, res) => {
  const { level } = req.params
  const validLevels = ['red', 'amber', 'green']

  if (!validLevels.includes(level)) {
    return res.status(400).json({ error: 'Invalid severity level' })
  }

  const alerts = sqlite.prepare(`
    SELECT * FROM alerts
    WHERE severity = ? AND status = 'open'
    ORDER BY fired_at DESC
  `).all(level) as any[]

  res.json({ severity: level, count: alerts.length, alerts })
})

// Get alerts for a specific product
router.get('/v1/alerts/product/:sku', (req, res) => {
  const { sku } = req.params
  const alerts = sqlite.prepare(`
    SELECT * FROM alerts
    WHERE scope_type = 'product' AND scope_id = ?
    ORDER BY fired_at DESC
  `).all(sku) as any[]

  res.json({ sku, alertCount: alerts.length, alerts })
})

// Acknowledge/resolve alert
router.patch('/v1/alerts/:id/acknowledge', (req, res) => {
  const { id } = req.params
  const { resolution } = req.body

  sqlite.prepare(`
    UPDATE alerts
    SET status = 'acknowledged', ai_analysis = ?
    WHERE id = ?
  `).run(resolution || null, id)

  res.json({ ok: true, id, status: 'acknowledged' })
})

// Close alert (mark as resolved)
router.patch('/v1/alerts/:id/resolve', (req, res) => {
  const { id } = req.params
  const { action_taken } = req.body

  sqlite.prepare(`
    UPDATE alerts
    SET status = 'resolved', ai_analysis = ?
    WHERE id = ?
  `).run(action_taken || null, id)

  res.json({ ok: true, id, status: 'resolved' })
})

// Get AI-generated insights
router.get('/v1/insights', (req, res) => {
  const marketplace = req.query.marketplace as string || 'amazon_in'
  const insights = sqlite.prepare(`
    SELECT * FROM ai_insights
    WHERE marketplace = ?
    ORDER BY generated_at DESC
    LIMIT 10
  `).all(marketplace) as any[]

  res.json({
    total: insights.length,
    insights: insights.map(i => ({
      id: i.id,
      generatedAt: i.generated_at,
      type: i.insight_type,
      insight: i.recommendations,
      confidence: i.confidence_score,
    })),
  })
})

// Get latest single insight
router.get('/v1/insights/latest', (_req, res) => {
  const insight = sqlite.prepare(`
    SELECT * FROM ai_insights
    ORDER BY generated_at DESC
    LIMIT 1
  `).get() as any

  if (!insight) {
    return res.json({
      message: 'No insights generated yet. Check back after first analytics cycle.',
    })
  }

  res.json({
    id: insight.id,
    generatedAt: insight.generated_at,
    type: insight.insight_type,
    insight: insight.recommendations,
    confidence: insight.confidence_score,
    data: insight.summary_json ? JSON.parse(insight.summary_json) : null,
  })
})

// Alert statistics
router.get('/v1/alerts/stats', (req, res) => {
  const marketplace = req.query.marketplace as string || 'amazon_in'
  const stats = sqlite.prepare(`
    SELECT
      COUNT(*) as total_open,
      SUM(CASE WHEN severity = 'red' THEN 1 ELSE 0 END) as critical,
      SUM(CASE WHEN severity = 'amber' THEN 1 ELSE 0 END) as warnings,
      SUM(CASE WHEN severity = 'green' THEN 1 ELSE 0 END) as info,
      COUNT(DISTINCT rule_id) as unique_rules,
      MAX(fired_at) as most_recent
    FROM alerts
    WHERE status IN ('open', 'acknowledged') AND marketplace = ?
  `).get(marketplace) as any

  const byRule = sqlite.prepare(`
    SELECT rule_id, COUNT(*) as count, severity
    FROM alerts
    WHERE status IN ('open', 'acknowledged')
    GROUP BY rule_id
    ORDER BY count DESC
    LIMIT 10
  `).all() as any[]

  res.json({
    stats: {
      totalOpen: stats?.total_open || 0,
      critical: stats?.critical || 0,
      warnings: stats?.warnings || 0,
      info: stats?.info || 0,
      uniqueRules: stats?.unique_rules || 0,
      mostRecent: stats?.most_recent,
    },
    topRules: byRule || [],
  })
})

// Health check: Do we have open critical alerts?
router.get('/v1/health/alerts', (_req, res) => {
  const critical = sqlite.prepare(`
    SELECT COUNT(*) as count FROM alerts
    WHERE severity = 'red' AND status = 'open'
  `).get() as any

  const hasCritical = (critical?.count || 0) > 0

  res.json({
    status: hasCritical ? 'critical' : 'healthy',
    openCriticalAlerts: critical?.count || 0,
    message: hasCritical ? 'Critical alerts require immediate attention' : 'All systems healthy',
  })
})

export default router
