import { sqlite } from '../db/client.js'

export function monitorDataQuality() {
  try {
    const checkedAt = new Date().toISOString()
    const marketplaces = ['amazon_in', 'meesho', 'snapdeal', 'flipkart']

    for (const marketplace of marketplaces) {
      // Get latest data timestamp
      const latestData = sqlite
        .prepare(
          `SELECT MAX(snapshot_date) as latest_date FROM metrics_platform_comparison
         WHERE marketplace = ?`
        )
        .get(marketplace) as any

      const lastSuccessfulSync = latestData?.latest_date

      // Calculate freshness in hours
      let freshnessHours = null
      if (lastSuccessfulSync) {
        const lastDate = new Date(lastSuccessfulSync)
        const now = new Date()
        freshnessHours = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60)
      }

      // Check data completeness (% of non-null key metrics)
      const recentSnapshot = sqlite
        .prepare(
          `SELECT
            impressions, clicks, orders, revenue, ctr_pct, cvr_pct, margin_pct
         FROM metrics_platform_comparison
         WHERE marketplace = ? ORDER BY snapshot_date DESC LIMIT 1`
        )
        .get(marketplace) as any

      let completeness = 0
      if (recentSnapshot) {
        const fields = [
          'impressions',
          'clicks',
          'orders',
          'revenue',
          'ctr_pct',
          'cvr_pct',
          'margin_pct',
        ]
        const filledFields = fields.filter((f: string) => recentSnapshot[f as keyof typeof recentSnapshot] !== null && recentSnapshot[f as keyof typeof recentSnapshot] !== undefined).length
        completeness = (filledFields / fields.length) * 100
      }

      // Determine collection success rate (how many days had data in last 7 days)
      const recentDays = sqlite
        .prepare(
          `SELECT COUNT(*) as record_count FROM metrics_platform_comparison
         WHERE marketplace = ? AND snapshot_date >= datetime('now', '-7 days')`
        )
        .get(marketplace) as any

      const successRate = (recentDays?.record_count || 0) > 0 ? 100 : 0 // Simplified - assume 0 or 100

      // Determine status
      let status = 'HEALTHY'
      let lastError = null

      if (!lastSuccessfulSync) {
        status = 'STALE'
        lastError = 'No data collected yet'
      } else if (freshnessHours && freshnessHours > 30) {
        status = 'STALE'
        lastError = `Data is ${freshnessHours.toFixed(1)} hours old`
      } else if (completeness < 80) {
        status = 'DEGRADED'
        lastError = `Data completeness only ${completeness.toFixed(0)}%`
      } else if (successRate < 50) {
        status = 'DEGRADED'
        lastError = `Collection success rate ${successRate.toFixed(0)}%`
      }

      // Get available metrics
      const metricsAvailable = recentSnapshot ? Object.keys(recentSnapshot).filter((k: string) => recentSnapshot[k as keyof typeof recentSnapshot] !== null) : []

      // Store report
      sqlite
        .prepare(
          `INSERT OR REPLACE INTO data_quality_report
         (checked_at, marketplace, data_freshness_hours, collection_success_rate,
          data_completeness_pct, status, last_successful_sync, last_error, metrics_available)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          checkedAt,
          marketplace,
          freshnessHours,
          successRate,
          completeness,
          status,
          lastSuccessfulSync,
          lastError,
          JSON.stringify(metricsAvailable)
        )
    }

    return {
      success: true,
      checked_at: checkedAt,
      platforms_monitored: marketplaces.length,
    }
  } catch (err) {
    console.error('[data-quality-monitor] Error:', err)
    return {
      success: false,
      error: String(err),
    }
  }
}
