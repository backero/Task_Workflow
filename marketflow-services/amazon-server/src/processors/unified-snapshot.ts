import { sqlite } from '../db/client.js'
import { getPlatformMetrics } from './platform-metrics.js'

interface PlatformSnapshot {
  marketplace: string
  impressions: number
  clicks: number
  orders: number
  revenue: number
  ctr_pct: number | null
  cvr_pct: number | null
  avg_order_value: number
  total_cogs: number
  total_fees: number
  net_profit: number
  margin_pct: number
  open_alerts: number
  critical_alerts: number
  avg_rating: number
  return_rate: number
  ctr_basis: string
  cvr_basis: string
  traffic_basis: string
}

export function captureUnifiedPlatformSnapshot() {
  try {
    const today = new Date().toISOString().split('T')[0]
    const marketplaces = ['amazon_in', 'meesho', 'snapdeal', 'flipkart']

    let snapshotsCreated = 0

    for (const marketplace of marketplaces) {
      const snapshot = collectPlatformMetrics(marketplace)

      // Calculate week-over-week and month-over-month changes
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const weekOldSnapshot = sqlite
        .prepare(
          `SELECT ctr_pct, cvr_pct, revenue, orders FROM metrics_platform_comparison
         WHERE marketplace = ? AND snapshot_date <= ? ORDER BY snapshot_date DESC LIMIT 1`
        )
        .get(marketplace, weekAgo) as any

      const monthOldSnapshot = sqlite
        .prepare(
          `SELECT ctr_pct, cvr_pct, revenue, orders FROM metrics_platform_comparison
         WHERE marketplace = ? AND snapshot_date <= ? ORDER BY snapshot_date DESC LIMIT 1`
        )
        .get(marketplace, monthAgo) as any

      let wowChangePct = null
      let momChangePct = null

      if (weekOldSnapshot && snapshot.revenue) {
        wowChangePct = ((snapshot.revenue - weekOldSnapshot.revenue) / weekOldSnapshot.revenue) * 100
      }

      if (monthOldSnapshot && snapshot.revenue) {
        momChangePct = ((snapshot.revenue - monthOldSnapshot.revenue) / monthOldSnapshot.revenue) * 100
      }

      // Insert snapshot
      sqlite
        .prepare(
          `INSERT OR REPLACE INTO metrics_platform_comparison
         (snapshot_date, marketplace, impressions, clicks, orders, revenue, ctr_pct, cvr_pct,
          avg_order_value, total_cogs, total_fees, net_profit, margin_pct,
          open_alerts, critical_alerts, avg_rating, return_rate, wow_change_pct, mom_change_pct, data_quality,
          ctr_basis, cvr_basis, traffic_basis)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'collected', ?, ?, ?)`
        )
        .run(
          today,
          marketplace,
          snapshot.impressions,
          snapshot.clicks,
          snapshot.orders,
          snapshot.revenue,
          snapshot.ctr_pct,
          snapshot.cvr_pct,
          snapshot.avg_order_value,
          snapshot.total_cogs,
          snapshot.total_fees,
          snapshot.net_profit,
          snapshot.margin_pct,
          snapshot.open_alerts,
          snapshot.critical_alerts,
          snapshot.avg_rating,
          snapshot.return_rate,
          wowChangePct,
          momChangePct,
          snapshot.ctr_basis,
          snapshot.cvr_basis,
          snapshot.traffic_basis
        )

      snapshotsCreated++
    }

    return {
      success: true,
      snapshots_created: snapshotsCreated,
      timestamp: new Date().toISOString(),
    }
  } catch (err) {
    console.error('[unified-snapshot] Error:', err)
    return {
      success: false,
      error: String(err),
      timestamp: new Date().toISOString(),
    }
  }
}

function collectPlatformMetrics(marketplace: string): PlatformSnapshot {
  let m
  try {
    m = getPlatformMetrics(marketplace)
  } catch (err) {
    console.log('[collectPlatformMetrics] Error collecting data:', err)
    m = getPlatformMetrics('__none__')
  }

  const alerts = sqlite
    .prepare(
      `SELECT
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_count,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count
       FROM alerts
       WHERE marketplace = ? AND status = 'open'`
    )
    .get(marketplace) as any

  return {
    marketplace,
    impressions: m.impressions,
    clicks: m.clicks,
    orders: m.orders,
    revenue: m.revenue,
    ctr_pct: m.ctr_pct,
    cvr_pct: m.cvr_pct,
    avg_order_value: m.aov,
    total_cogs: 0,
    total_fees: 0,
    net_profit: 0,
    margin_pct: 0,
    open_alerts: alerts?.open_count || 0,
    critical_alerts: alerts?.critical_count || 0,
    avg_rating: m.rating,
    return_rate: m.return_rate,
    ctr_basis: m.ctr_basis,
    cvr_basis: m.cvr_basis,
    traffic_basis: m.traffic_basis,
  }
}
