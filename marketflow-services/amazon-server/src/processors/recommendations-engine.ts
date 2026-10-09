import { sqlite } from '../db/client.js'

interface Recommendation {
  marketplace: string
  category: string
  title: string
  description: string
  action_steps: string[]
  priority: 'high' | 'medium' | 'low'
  estimated_impact: number
  implementation_effort: 'easy' | 'moderate' | 'complex'
  success_metrics: { metric: string; target: number }[]
}

export function generateRecommendations() {
  try {
    const recommendations: Recommendation[] = []
    const marketplaces = ['amazon_in', 'meesho', 'snapdeal', 'flipkart']

    for (const mp of marketplaces) {
      // Get pricing recommendations
      const pricingRec = generatePricingRecommendation(mp)
      if (pricingRec) recommendations.push(pricingRec)

      // Get inventory recommendations
      const inventoryRec = generateInventoryRecommendation(mp)
      if (inventoryRec) recommendations.push(inventoryRec)

      // Get marketing recommendations
      const marketingRec = generateMarketingRecommendation(mp)
      if (marketingRec) recommendations.push(marketingRec)

      // Get quality recommendations
      const qualityRec = generateQualityRecommendation(mp)
      if (qualityRec) recommendations.push(qualityRec)

      // Get platform focus recommendation
      const focusRec = generatePlatformFocusRecommendation(mp)
      if (focusRec) recommendations.push(focusRec)
    }

    // Get cross-platform recommendations
    const crossPlatformRec = generateCrossPlatformRecommendation(marketplaces)
    if (crossPlatformRec) recommendations.push(crossPlatformRec)

    // Store recommendations
    const generatedAt = new Date().toISOString()
    let stored = 0

    for (const rec of recommendations) {
      sqlite
        .prepare(
          `INSERT INTO recommendations_with_actions
         (generated_at, marketplace, category, title, description, action_steps,
          priority, estimated_impact, implementation_effort, success_metrics, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`
        )
        .run(
          generatedAt,
          rec.marketplace,
          rec.category,
          rec.title,
          rec.description,
          JSON.stringify(rec.action_steps),
          rec.priority,
          rec.estimated_impact,
          rec.implementation_effort,
          JSON.stringify(rec.success_metrics)
        )
      stored++
    }

    return {
      success: true,
      recommendations_generated: stored,
      timestamp: generatedAt,
    }
  } catch (err) {
    console.error('[recommendations-engine] Error:', err)
    return {
      success: false,
      error: String(err),
    }
  }
}

function generatePricingRecommendation(marketplace: string): Recommendation | null {
  try {
    const snapshot = sqlite
      .prepare(
        `SELECT margin_pct, revenue FROM metrics_platform_comparison
       WHERE marketplace = ? ORDER BY snapshot_date DESC LIMIT 1`
      )
      .get(marketplace) as any

    if (!snapshot || snapshot.margin_pct > 20) return null

    return {
      marketplace,
      category: 'pricing',
      title: `Optimize pricing strategy on ${marketplace}`,
      description: `Current margin is ${snapshot.margin_pct?.toFixed(1)}%. Review pricing to improve profitability.`,
      action_steps: [
        'Analyze competitor pricing using marketplace tools',
        'Identify products with lowest margins (aim for minimum 15%)',
        'Test price increases on high-demand items (5-10% test)',
        'Monitor conversion impact for 1-2 weeks',
        'Scale winners, revert losers',
      ],
      priority: snapshot.margin_pct < 10 ? 'high' : 'medium',
      estimated_impact: 8, // 8% potential revenue lift
      implementation_effort: 'easy',
      success_metrics: [
        { metric: 'margin_pct', target: 18 },
        { metric: 'revenue_growth', target: 5 },
      ],
    }
  } catch (err) {
    console.error('[generatePricingRecommendation] Error:', err)
    return null
  }
}

function generateInventoryRecommendation(marketplace: string): Recommendation | null {
  try {
    const snapshot = sqlite
      .prepare(
        `SELECT orders, revenue FROM metrics_platform_comparison
       WHERE marketplace = ? ORDER BY snapshot_date DESC LIMIT 1`
      )
      .get(marketplace) as any

    if (!snapshot || snapshot.orders < 10) return null

    // If orders are high, inventory might be an issue
    if (snapshot.orders > 50) {
      return {
        marketplace,
        category: 'inventory',
        title: `Increase stock allocation for ${marketplace}`,
        description: `Strong performance with ${snapshot.orders} orders. Increase inventory to capitalize.`,
        action_steps: [
          'Review best-selling SKUs on this marketplace',
          'Increase stock for top 10 SKUs by 30%',
          'Adjust logistics timing - expect faster turnover',
          'Monitor days-of-cover (target: 30-45 days)',
          'Set up reorder alerts',
        ],
        priority: 'high',
        estimated_impact: 12,
        implementation_effort: 'moderate',
        success_metrics: [
          { metric: 'orders', target: 80 },
          { metric: 'stockout_days', target: 2 },
        ],
      }
    }

    return null
  } catch (err) {
    console.error('[generateInventoryRecommendation] Error:', err)
    return null
  }
}

function generateMarketingRecommendation(marketplace: string): Recommendation | null {
  try {
    const snapshot = sqlite
      .prepare(
        `SELECT ctr_pct, cvr_pct FROM metrics_platform_comparison
       WHERE marketplace = ? ORDER BY snapshot_date DESC LIMIT 1`
      )
      .get(marketplace) as any

    if (!snapshot) return null

    const avgCTR = 1.5
    const avgCVR = 1.2

    // A figure a platform does not report is null: never treat it as "low".
    const ctrLow = snapshot.ctr_pct != null && snapshot.ctr_pct < avgCTR
    const cvrLow = snapshot.cvr_pct != null && snapshot.cvr_pct < avgCVR
    if (ctrLow || cvrLow) {
      const issue = ctrLow ? 'CTR' : 'CVR'

      return {
        marketplace,
        category: 'marketing',
        title: `Boost ${issue} on ${marketplace}`,
        description: `Current ${issue} is ${(issue === 'CTR' ? snapshot.ctr_pct : snapshot.cvr_pct).toFixed(2)}%. Below benchmark.`,
        action_steps:
          issue === 'CTR'
            ? [
                'Enhance product titles - include top keywords',
                'Add A+ content/Enhanced Brand Content',
                'Refresh product images (main image is critical)',
                'Increase ad spend on high-intent keywords',
                'Test different offer strategies (coupons/deals)',
              ]
            : [
                'Improve product description - be benefit-focused',
                'Add customer reviews (offer incentives ethically)',
                'Test price reduction on slower movers',
                'Improve product images - add lifestyle shots',
                'Add FAQ section addressing common concerns',
              ],
        priority: (snapshot.ctr_pct ?? 99) < 0.5 || (snapshot.cvr_pct ?? 99) < 0.3 ? 'high' : 'medium',
        estimated_impact: issue === 'CTR' ? 15 : 12,
        implementation_effort: 'moderate',
        success_metrics: [
          { metric: issue === 'CTR' ? 'ctr_pct' : 'cvr_pct', target: issue === 'CTR' ? 2.5 : 1.5 },
          { metric: 'orders', target: 20 },
        ],
      }
    }

    return null
  } catch (err) {
    console.error('[generateMarketingRecommendation] Error:', err)
    return null
  }
}

function generateQualityRecommendation(marketplace: string): Recommendation | null {
  try {
    const snapshot = sqlite
      .prepare(
        `SELECT avg_rating, return_rate, open_alerts FROM metrics_platform_comparison
       WHERE marketplace = ? ORDER BY snapshot_date DESC LIMIT 1`
      )
      .get(marketplace) as any

    if (!snapshot) return null

    if (snapshot.avg_rating < 4.0 || snapshot.return_rate > 0.05) {
      return {
        marketplace,
        category: 'quality',
        title: `Improve product quality/rating on ${marketplace}`,
        description: `Rating: ${snapshot.avg_rating?.toFixed(1)}/5. Return rate: ${(snapshot.return_rate * 100).toFixed(1)}%.`,
        action_steps: [
          'Analyze negative reviews - find common complaints',
          'Respond to all negative reviews professionally',
          'If quality issue: contact supplier, improve QC',
          'If misrepresentation: update listings/images',
          'If logistics issue: improve packaging/carriers',
          'Offer replacement/refund for genuine issues',
        ],
        priority: snapshot.avg_rating < 3.5 ? 'high' : 'medium',
        estimated_impact: 10,
        implementation_effort: 'moderate',
        success_metrics: [
          { metric: 'avg_rating', target: 4.3 },
          { metric: 'return_rate', target: 0.02 },
        ],
      }
    }

    return null
  } catch (err) {
    console.error('[generateQualityRecommendation] Error:', err)
    return null
  }
}

function generatePlatformFocusRecommendation(marketplace: string): Recommendation | null {
  try {
    const allPlatforms = sqlite
      .prepare(
        `SELECT marketplace, revenue FROM metrics_platform_comparison
       WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM metrics_platform_comparison)`
      )
      .all() as any[]

    if (allPlatforms.length < 2) return null

    const sorted = allPlatforms.sort((a: any, b: any) => (b.revenue || 0) - (a.revenue || 0))
    const currentRank = sorted.findIndex((p: any) => p.marketplace === marketplace) + 1
    const topRevenue = sorted[0]?.revenue || 0
    const currentRevenue = sorted.find((p: any) => p.marketplace === marketplace)?.revenue || 0

    // If this platform is underperforming, recommend focus
    if (currentRank > 2 && currentRevenue < topRevenue * 0.5) {
      return {
        marketplace,
        category: 'platform_strategy',
        title: `Increase focus on ${marketplace} (tier ${currentRank})`,
        description: `Revenue is ₹${currentRevenue.toLocaleString()} vs leader ₹${topRevenue.toLocaleString()}. Opportunity to grow.`,
        action_steps: [
          `Review top performers on this platform - copy best practices`,
          `Allocate more inventory to fast-moving SKUs`,
          `Increase ad budget by 20-30% for 4 weeks`,
          `Partner with influencers/reviewers popular on this platform`,
          `Launch platform-specific promotions`,
        ],
        priority: 'medium',
        estimated_impact: 25,
        implementation_effort: 'moderate',
        success_metrics: [
          { metric: 'revenue', target: currentRevenue * 1.3 },
          { metric: 'orders', target: 50 },
        ],
      }
    }

    return null
  } catch (err) {
    console.error('[generatePlatformFocusRecommendation] Error:', err)
    return null
  }
}

function generateCrossPlatformRecommendation(marketplaces: string[]): Recommendation | null {
  try {
    const platforms = sqlite
      .prepare(
        `SELECT marketplace, margin_pct, ctr_pct FROM metrics_platform_comparison
       WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM metrics_platform_comparison)`
      )
      .all() as any[]

    if (platforms.length < 2) return null

    const avgMargin = platforms.reduce((sum: number, p: any) => sum + (p.margin_pct || 0), 0) / platforms.length

    return {
      marketplace: 'all',
      category: 'operations',
      title: `Cross-platform optimization strategy`,
      description: `Standardize processes across all ${marketplaces.length} platforms to reduce operational complexity.`,
      action_steps: [
        'Standardize product data (titles, descriptions, images)',
        'Create centralized inventory pool - allocate by demand',
        'Unified pricing strategy - adjust per platform demand elasticity',
        'Consolidated customer service - handle all platforms from one system',
        'Monthly cross-platform performance review meetings',
      ],
      priority: 'medium',
      estimated_impact: 8,
      implementation_effort: 'complex',
      success_metrics: [
        { metric: 'operational_efficiency', target: 20 },
        { metric: 'avg_margin', target: avgMargin + 3 },
      ],
    }
  } catch (err) {
    console.error('[generateCrossPlatformRecommendation] Error:', err)
    return null
  }
}
