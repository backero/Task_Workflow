import { sqlite } from '../db/client.js'
import { amazonMetrics, getPlatformMetrics, type PlatformMetrics } from './platform-metrics.js'

/**
 * Trend Analytics - Daily snapshots for graphing
 * Captures daily metrics for each platform to show trends over time
 */

export interface TrendSnapshot {
  date: string
  marketplace: string
  ctr_pct: number | null
  cvr_pct: number | null
  impressions: number
  clicks: number
  orders: number
  revenue: number
  alerts_open: number
  alerts_critical: number
  avg_rating?: number
  ctr_basis?: string | null
  cvr_basis?: string | null
  traffic_basis?: string | null
}

function alertStatsFor(marketplace: string) {
  return sqlite.prepare(`
    SELECT
      COUNT(*) as open_count,
      SUM(CASE WHEN severity IN ('red', 'critical') THEN 1 ELSE 0 END) as critical_count
    FROM alerts
    WHERE status = 'open' AND marketplace = ?
  `).get(marketplace) as any
}

function storeTrend(date: string, m: PlatformMetrics) {
  const alerts = alertStatsFor(m.marketplace)
  sqlite.prepare(`
    INSERT OR REPLACE INTO metrics_trend_snapshot (
      date, marketplace, ctr_pct, cvr_pct, impressions, clicks, orders,
      revenue, alerts_open, alerts_critical, avg_rating, data_quality,
      ctr_basis, cvr_basis, traffic_basis
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'collected', ?, ?, ?)
  `).run(
    date, m.marketplace, m.ctr_pct, m.cvr_pct, m.impressions, m.clicks, m.orders, m.revenue,
    alerts?.open_count || 0, alerts?.critical_count || 0, m.rating || null,
    m.ctr_basis, m.cvr_basis, m.traffic_basis
  )
}

export function captureAmazonTrend() {
  const today = new Date().toISOString().split('T')[0]
  // Amazon's Business Report lags 1-2 days: record the latest day Amazon has actually published, labelled with
  // that real date (not "today").
  const dates = sqlite
    .prepare(`SELECT DISTINCT date FROM fact_listing_daily WHERE date <= ? AND date >= date(?, '-30 days') ORDER BY date`)
    .all(today, today) as Array<{ date: string }>
  for (const { date } of dates) storeTrend(date, amazonMetrics(date))
  return dates.length
}

// Meesho / Snapdeal / Flipkart: today's reading of each platform's own panel (see platform-metrics.ts).
function capturePlatformTrend(marketplace: string) {
  const m = getPlatformMetrics(marketplace)
  if (m.impressions === 0 && m.orders === 0 && m.revenue === 0) return 0
  storeTrend(new Date().toISOString().split('T')[0], m)
  return 1
}

export const captureMeeshoTrend = () => capturePlatformTrend('meesho')
export const captureSnapdealTrend = () => capturePlatformTrend('snapdeal')
export const captureFlipkartTrend = () => capturePlatformTrend('flipkart')

export function runTrendCapture() {
  console.log('[trend-analytics] Capturing daily trends for all platforms...')
  try {
    const results = {
      amazon: captureAmazonTrend(),
      meesho: captureMeeshoTrend(),
      snapdeal: captureSnapdealTrend(),
      flipkart: captureFlipkartTrend(),
    }
    console.log('[trend-analytics] Trends captured:', results)
    return results
  } catch (err) {
    console.error('[trend-analytics] Error:', err)
    return { error: String(err) }
  }
}

export function getTrendData(marketplace: string, days: number = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const trends = sqlite.prepare(`
    SELECT
      date, ctr_pct, cvr_pct, impressions, clicks, orders, revenue,
      alerts_open, alerts_critical, avg_rating, ctr_basis, cvr_basis, traffic_basis
    FROM metrics_trend_snapshot
    WHERE marketplace = ? AND date >= ?
    ORDER BY date ASC
  `).all(marketplace, startDate) as unknown as TrendSnapshot[]

  return {
    marketplace,
    period_days: days,
    data: trends,
    latest: trends.length > 0 ? trends[trends.length - 1] : null,
    change: trends.length >= 2 ? {
      ctr_pct: trends[trends.length - 1].ctr_pct != null && trends[0].ctr_pct != null ? (trends[trends.length - 1].ctr_pct! - trends[0].ctr_pct!).toFixed(2) : null,
      cvr_pct: trends[trends.length - 1].cvr_pct != null && trends[0].cvr_pct != null ? (trends[trends.length - 1].cvr_pct! - trends[0].cvr_pct!).toFixed(2) : null,
      orders: (trends[trends.length - 1].orders - trends[0].orders),
      revenue: (trends[trends.length - 1].revenue - trends[0].revenue).toFixed(0),
    } : null,
  }
}

export function getDataQualityReport() {
  const platforms = ['amazon_in', 'meesho', 'snapdeal', 'flipkart']
  const report: any = {}

  for (const marketplace of platforms) {
    const trends = sqlite.prepare(`
      SELECT COUNT(*) as total FROM metrics_trend_snapshot WHERE marketplace = ?
    `).get(marketplace) as any

    const lastUpdate = sqlite.prepare(`
      SELECT MAX(date) as last_date FROM metrics_trend_snapshot WHERE marketplace = ?
    `).get(marketplace) as any

    const latestData = sqlite.prepare(`
      SELECT * FROM metrics_trend_snapshot WHERE marketplace = ? ORDER BY date DESC LIMIT 1
    `).get(marketplace) as any

    report[marketplace] = {
      total_snapshots: trends.total || 0,
      last_update: lastUpdate.last_date || 'No data',
      latest_metrics: latestData ? {
        ctr_pct: latestData.ctr_pct,
        cvr_pct: latestData.cvr_pct,
        impressions: latestData.impressions,
        orders: latestData.orders,
        alerts_open: latestData.alerts_open,
      } : null,
      data_status: trends.total > 0 ? 'ACTIVE' : 'PENDING',
    }
  }

  return report
}
