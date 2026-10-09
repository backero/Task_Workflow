import { Router } from 'express'
import { sqlite } from '../db/client.js'

const router = Router()

// Get AI platform insights
router.get('/v1/insights/platform-analysis', (req, res) => {
  try {
    const marketplace = req.query.marketplace as string
    const days = parseInt(req.query.days as string) || 7

    let query = `SELECT * FROM ai_platform_insights WHERE generated_at >= datetime('now', '-${days} days')`
    const params: any[] = []

    if (marketplace && marketplace !== 'all') {
      query += ` AND marketplace = ?`
      params.push(marketplace)
    }

    query += ` ORDER BY generated_at DESC LIMIT 50`

    const insights = sqlite.prepare(query).all(...params) as any[]

    // Parse JSON fields
    const parsedInsights = insights.map((insight) => ({
      ...insight,
      findings_json: insight.findings_json ? JSON.parse(insight.findings_json) : null,
    }))

    res.json({
      timestamp: new Date().toISOString(),
      marketplace: marketplace || 'all',
      insights_count: parsedInsights.length,
      insights: parsedInsights,
    })
  } catch (err) {
    console.error('[insights] Error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// Get recommendations with action plans
router.get('/v1/recommendations/action-plan', (req, res) => {
  try {
    const marketplace = req.query.marketplace as string
    const category = req.query.category as string
    const priority = req.query.priority as string
    const status = req.query.status as string

    let query = `SELECT * FROM recommendations_with_actions WHERE status IN ('open', 'in_progress')`
    const params: any[] = []

    if (marketplace && marketplace !== 'all') {
      query += ` AND marketplace = ?`
      params.push(marketplace)
    }

    if (category) {
      query += ` AND category = ?`
      params.push(category)
    }

    if (priority) {
      query += ` AND priority = ?`
      params.push(priority)
    }

    if (status) {
      query += ` AND status = ?`
      params.push(status)
    }

    query += ` ORDER BY
      CASE WHEN priority = 'high' THEN 1
           WHEN priority = 'medium' THEN 2
           ELSE 3 END,
      estimated_impact DESC,
      generated_at DESC
    LIMIT 100`

    const recommendations = sqlite.prepare(query).all(...params) as any[]

    // Parse JSON fields
    const parsed = recommendations.map((rec) => ({
      ...rec,
      action_steps: rec.action_steps ? JSON.parse(rec.action_steps) : [],
      success_metrics: rec.success_metrics ? JSON.parse(rec.success_metrics) : [],
    }))

    // Score each recommendation
    const scored = parsed.map((rec) => ({
      ...rec,
      impact_score: calculateImpactScore(rec),
      effort_score: calculateEffortScore(rec),
      priority_score: calculatePriorityScore(rec),
    }))

    // Sort by overall score
    scored.sort((a, b) => b.priority_score - a.priority_score)

    res.json({
      timestamp: new Date().toISOString(),
      marketplace: marketplace || 'all',
      category: category || 'all',
      recommendations_count: scored.length,
      recommendations: scored,
      summary: {
        high_priority: scored.filter((r) => r.priority === 'high').length,
        medium_priority: scored.filter((r) => r.priority === 'medium').length,
        total_estimated_impact: scored.reduce((sum: number, r) => sum + (r.estimated_impact || 0), 0),
      },
    })
  } catch (err) {
    console.error('[recommendations] Error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// Get single recommendation detail
router.get('/v1/recommendations/:id', (req, res) => {
  try {
    const { id } = req.params

    const recommendation = sqlite
      .prepare(`SELECT * FROM recommendations_with_actions WHERE id = ?`)
      .get(parseInt(id)) as any

    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found' })
    }

    recommendation.action_steps = recommendation.action_steps ? JSON.parse(recommendation.action_steps) : []
    recommendation.success_metrics = recommendation.success_metrics ? JSON.parse(recommendation.success_metrics) : []

    res.json({
      timestamp: new Date().toISOString(),
      recommendation,
      impact_score: calculateImpactScore(recommendation),
      effort_score: calculateEffortScore(recommendation),
      priority_score: calculatePriorityScore(recommendation),
    })
  } catch (err) {
    console.error('[recommendation-detail] Error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// Update recommendation status
router.put('/v1/recommendations/:id/status', (req, res) => {
  try {
    const { id } = req.params
    const { status, dismissed_reason } = req.body

    const validStatuses = ['open', 'in_progress', 'completed', 'dismissed']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    sqlite
      .prepare(`UPDATE recommendations_with_actions SET status = ?, dismissed_reason = ? WHERE id = ?`)
      .run(status, dismissed_reason || null, parseInt(id))

    res.json({
      timestamp: new Date().toISOString(),
      success: true,
      message: `Recommendation updated to ${status}`,
    })
  } catch (err) {
    console.error('[recommendation-update] Error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// Get insights summary
router.get('/v1/insights/summary', (_req, res) => {
  try {
    const insights = sqlite
      .prepare(
        `SELECT analysis_type, COUNT(*) as count, AVG(confidence_score) as avg_confidence
       FROM ai_platform_insights
       WHERE generated_at >= datetime('now', '-7 days')
       GROUP BY analysis_type`
      )
      .all() as any[]

    const summary = sqlite
      .prepare(
        `SELECT
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority,
        COUNT(CASE WHEN priority = 'medium' THEN 1 END) as medium_priority,
        COUNT(CASE WHEN priority = 'low' THEN 1 END) as low_priority,
        COUNT(DISTINCT marketplace) as platforms_with_recommendations,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress
       FROM recommendations_with_actions`
      )
      .get() as any

    res.json({
      timestamp: new Date().toISOString(),
      insights_by_type: insights,
      recommendations_summary: summary,
    })
  } catch (err) {
    console.error('[insights-summary] Error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// Scoring functions
function calculateImpactScore(rec: any): number {
  return rec.estimated_impact || 0
}

function calculateEffortScore(rec: any): number {
  const effortMap: any = { easy: 1, moderate: 2, complex: 3 }
  return effortMap[rec.implementation_effort] || 2
}

function calculatePriorityScore(rec: any): number {
  const priorityWeight: any = { high: 3, medium: 2, low: 1 }
  const impact = rec.estimated_impact || 0
  const priority = priorityWeight[rec.priority] || 1
  const effort = calculateEffortScore(rec)

  // Score = (impact * priority) / effort
  return (impact * priority) / effort
}

export default router
