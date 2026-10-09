import { sqlite } from '../db/client.js'
import { Anthropic } from '@anthropic-ai/sdk'

const client = new Anthropic()

export function runAIAnalysisEngine() {
  try {
    const insights: any[] = []

    // Cross-platform insights (marketplace = null, shown only on the all-platforms view) plus one set per
    // platform, so a platform's own pages never show another platform's numbers.
    const scopes: Array<string | undefined> = [undefined, 'amazon_in', 'meesho', 'snapdeal', 'flipkart']
    for (const only of scopes) {
      for (const analyze of [analyzeCTRTrends, analyzeCVRPatterns, analyzeProfitabilityGaps, detectRisks]) {
        const result = analyze(only)
        if (result) insights.push(result)
      }
    }

    // Store all insights
    const generatedAt = new Date().toISOString()
    for (const insight of insights) {
      sqlite
        .prepare(
          `INSERT INTO ai_platform_insights
         (generated_at, analysis_type, marketplace, summary, findings_json, recommendations, confidence_score)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          generatedAt,
          insight.type,
          insight.marketplace || null,
          insight.summary,
          JSON.stringify(insight.findings),
          insight.recommendations,
          insight.confidence
        )
    }

    return {
      success: true,
      insights_generated: insights.length,
      timestamp: generatedAt,
    }
  } catch (err) {
    console.error('[ai-analysis-engine] Error:', err)
    return {
      success: false,
      error: String(err),
    }
  }
}

function analyzeCTRTrends(only?: string) {
  try {
    const marketplaces = only ? [only] : ['amazon_in', 'meesho', 'snapdeal', 'flipkart']
    const ctrData: any = {}

    for (const mp of marketplaces) {
      const trend = sqlite
        .prepare(
          `SELECT ctr_pct FROM metrics_platform_comparison
         WHERE marketplace = ? ORDER BY snapshot_date DESC LIMIT 2`
        )
        .all(mp) as any[]

      if (trend.length >= 2 && trend[1].ctr_pct > 0) {
        const current = trend[0].ctr_pct
        const previous = trend[1].ctr_pct
        const change = ((current - previous) / previous) * 100

        ctrData[mp] = {
          current: current,
          previous: previous,
          change_pct: change,
          trend: change > 0 ? 'up' : 'down',
          severity: Math.abs(change) > 10 ? 'high' : Math.abs(change) > 5 ? 'medium' : 'low',
        }
      }
    }

    if (Object.keys(ctrData).length === 0) return null

    const summary = `CTR Analysis: ${Object.entries(ctrData)
      .map(([mp, data]: [string, any]) => `${mp} ${data.trend} ${Math.abs(data.change_pct).toFixed(1)}%`)
      .join(', ')}`

    return {
      type: 'ctr_trends',
      marketplace: only ?? null,
      summary,
      findings: ctrData,
      recommendations: generateCTRRecommendations(ctrData),
      confidence: 0.85,
    }
  } catch (err) {
    console.error('[analyzeCTRTrends] Error:', err)
    return null
  }
}

function analyzeCVRPatterns(only?: string) {
  try {
    const marketplaces = only ? [only] : ['amazon_in', 'meesho', 'snapdeal', 'flipkart']
    const cvrData: any = {}

    for (const mp of marketplaces) {
      const trend = sqlite
        .prepare(
          `SELECT cvr_pct, orders FROM metrics_platform_comparison
         WHERE marketplace = ? ORDER BY snapshot_date DESC LIMIT 30`
        )
        .all(mp) as any[]

      if (trend.length > 0) {
        const avgCVR = trend.reduce((sum: number, t: any) => sum + (t.cvr_pct || 0), 0) / trend.length
        const maxCVR = Math.max(...trend.map((t: any) => t.cvr_pct || 0))
        const minCVR = Math.min(...trend.filter((t: any) => t.cvr_pct > 0).map((t: any) => t.cvr_pct || 0))

        cvrData[mp] = {
          avg_cvr: parseFloat(avgCVR.toFixed(2)),
          max_cvr: maxCVR,
          min_cvr: minCVR,
          volatility: parseFloat((maxCVR - minCVR).toFixed(2)),
          performance: avgCVR > 2 ? 'excellent' : avgCVR > 1 ? 'good' : avgCVR > 0.5 ? 'fair' : 'poor',
        }
      }
    }

    if (Object.keys(cvrData).length === 0) return null

    const summary = `CVR Patterns: ${Object.entries(cvrData)
      .map(([mp, data]: [string, any]) => `${mp} avg ${data.avg_cvr}%`)
      .join(', ')}`

    return {
      type: 'cvr_patterns',
      marketplace: only ?? null,
      summary,
      findings: cvrData,
      recommendations: generateCVRRecommendations(cvrData),
      confidence: 0.8,
    }
  } catch (err) {
    console.error('[analyzeCVRPatterns] Error:', err)
    return null
  }
}

function analyzeProfitabilityGaps(only?: string) {
  try {
    const marketplaces = only ? [only] : ['amazon_in', 'meesho', 'snapdeal', 'flipkart']
    const profitData: any = {}

    for (const mp of marketplaces) {
      const snapshot = sqlite
        .prepare(
          `SELECT margin_pct, net_profit, revenue, orders FROM metrics_platform_comparison
         WHERE marketplace = ? ORDER BY snapshot_date DESC LIMIT 1`
        )
        .get(mp) as any

      if (snapshot) {
        profitData[mp] = {
          margin_pct: snapshot.margin_pct || 0,
          net_profit: snapshot.net_profit || 0,
          revenue: snapshot.revenue || 0,
          profit_per_order: snapshot.revenue && snapshot.orders ? snapshot.net_profit / snapshot.orders : 0,
          efficiency: snapshot.margin_pct > 20 ? 'efficient' : snapshot.margin_pct > 10 ? 'moderate' : 'needs_improvement',
        }
      }
    }

    if (Object.keys(profitData).length === 0) return null

    const avgMargin =
      Object.values(profitData).reduce((sum: number, p: any) => sum + (p.margin_pct || 0), 0) /
      Object.keys(profitData).length

    const summary = `Profitability: Average margin ${avgMargin.toFixed(1)}%. Gaps detected: ${Object.entries(profitData)
      .filter(([_, p]: [string, any]) => p.margin_pct < avgMargin - 5)
      .map(([mp, _]) => mp)
      .join(', ')}`

    return {
      type: 'profitability_gaps',
      marketplace: only ?? null,
      summary,
      findings: { platforms: profitData, average_margin: avgMargin },
      recommendations: generateProfitabilityRecommendations(profitData, avgMargin),
      confidence: 0.9,
    }
  } catch (err) {
    console.error('[analyzeProfitabilityGaps] Error:', err)
    return null
  }
}

function detectRisks(only?: string) {
  try {
    const risks: any = {}
    const marketplaces = only ? [only] : ['amazon_in', 'meesho', 'snapdeal', 'flipkart']

    for (const mp of marketplaces) {
      const metrics = sqlite
        .prepare(
          `SELECT open_alerts, critical_alerts, return_rate, avg_rating FROM metrics_platform_comparison
         WHERE marketplace = ? ORDER BY snapshot_date DESC LIMIT 1`
        )
        .get(mp) as any

      const riskFactors = []

      if (metrics?.critical_alerts > 5) riskFactors.push(`${metrics.critical_alerts} critical alerts`)
      if (metrics?.return_rate > 0.05) riskFactors.push(`High return rate: ${(metrics.return_rate * 100).toFixed(1)}%`)
      if (metrics?.avg_rating < 3.5) riskFactors.push(`Low rating: ${metrics.avg_rating?.toFixed(1)}`)
      if (metrics?.open_alerts > 15) riskFactors.push(`Too many open alerts: ${metrics.open_alerts}`)

      if (riskFactors.length > 0) {
        risks[mp] = {
          risk_level: riskFactors.length > 2 ? 'high' : 'medium',
          factors: riskFactors,
          action_needed: true,
        }
      }
    }

    const riskySummary = Object.entries(risks)
      .map(([mp, r]: [string, any]) => `${mp}: ${r.factors.join(', ')}`)
      .join('; ')

    return {
      type: 'risk_detection',
      marketplace: only ?? null,
      summary: riskySummary || 'No significant risks detected',
      findings: risks,
      recommendations: generateRiskRecommendations(risks),
      confidence: 0.88,
    }
  } catch (err) {
    console.error('[detectRisks] Error:', err)
    return null
  }
}

// Recommendation generators
function generateCTRRecommendations(ctrData: any): string {
  const declining = Object.entries(ctrData)
    .filter(([_, data]: [string, any]) => data.trend === 'down')
    .map(([mp, _]) => mp)

  if (declining.length === 0) return 'CTR trends are stable. Continue monitoring.'

  return `CTR declining on: ${declining.join(', ')}.
  Recommendations:
  1. Review product listings - enhance titles and images
  2. Check competitor pricing - may be undercutting you
  3. Increase ad spend on high-performing keywords
  4. Analyze search term performance and add negative keywords`
}

function generateCVRRecommendations(cvrData: any): string {
  const lowCVR = Object.entries(cvrData)
    .filter(([_, data]: [string, any]) => data.avg_cvr < 1)
    .map(([mp, _]) => mp)

  if (lowCVR.length === 0) return 'CVR performance is good across platforms.'

  return `Low CVR detected on: ${lowCVR.join(', ')}.
  Recommendations:
  1. Optimize product descriptions - be more compelling
  2. Improve product images - add lifestyle shots
  3. Add more customer reviews - boost social proof
  4. Test different price points - conversion is price-sensitive`
}

function generateProfitabilityRecommendations(profitData: any, avgMargin: number): string {
  const lowMargin = Object.entries(profitData).filter(([_, p]: [string, any]) => p.margin_pct < avgMargin - 5)

  if (lowMargin.length === 0) return 'Profitability is well-balanced across platforms.'

  return `Lower margins detected on: ${lowMargin.map(([mp, _]) => mp).join(', ')}.
  Recommendations:
  1. Negotiate better supplier pricing
  2. Reduce logistics/fulfillment costs
  3. Review and optimize fee structure (consider FBA vs FBM)
  4. Focus on high-margin SKUs, reduce low-margin inventory`
}

function generateRiskRecommendations(risks: any): string {
  if (Object.keys(risks).length === 0) return 'All platforms are healthy.'

  return `Risk factors detected. Immediate actions:
  1. Review critical alerts - resolve compliance/policy issues
  2. Investigate high return rates - quality or misrepresentation?
  3. Address low ratings - respond to negative reviews
  4. Monitor alert trends - prevent escalation`
}
