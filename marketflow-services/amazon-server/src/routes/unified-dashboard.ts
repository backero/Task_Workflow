import { Router } from 'express'
import { sqlite } from '../db/client.js'

const router = Router()

// Get unified dashboard: all platforms at a glance
router.get('/v1/dashboard/unified', (_req, res) => {
  try {
    const marketplaces = ['amazon_in', 'meesho', 'snapdeal', 'flipkart']

    const platforms: any = {}
    const metrics_ranking: any = {
      ctr: [],
      cvr: [],
      orders: [],
      revenue: [],
      margin: [],
    }

    // Get latest data for each platform from raw_ingest (fresh data)
    for (const mp of marketplaces) {
      // Try to get from metrics_platform_comparison first (processed data)
      const snapshot = sqlite
        .prepare(
          `SELECT * FROM metrics_platform_comparison
         WHERE marketplace = ?
         ORDER BY snapshot_date DESC LIMIT 1`
        )
        .get(mp) as any

      // Only fall back to raw_ingest when there is truly no processed snapshot at all.
      // A snapshot with impressions=0/orders=0 can be the honest current state (e.g. Snapdeal
      // hasn't captured order-level traffic yet) - it must not be papered over.
      // The previous fallback here also used SUM(...) across the entire raw_ingest history,
      // which silently added up every historical row ever ingested (including stale/incorrect
      // test data from before the bridge was fixed) instead of reading only the latest one.
      let platformData = snapshot
      if (!snapshot) {
        const rawData = sqlite
          .prepare(
            `SELECT
              marketplace,
              CAST(json_extract(body_json, '$.kpis.impressions') AS REAL) as impressions,
              CAST(json_extract(body_json, '$.kpis.clicks') AS REAL) as clicks,
              CAST(json_extract(body_json, '$.kpis.orders') AS REAL) as orders,
              CAST(json_extract(body_json, '$.kpis.revenue') AS REAL) as revenue,
              CAST(json_extract(body_json, '$.kpis.ctr_pct') AS REAL) as ctr_pct,
              CAST(json_extract(body_json, '$.kpis.cvr_pct') AS REAL) as cvr_pct
            FROM raw_ingest
            WHERE marketplace = ? AND payload_type = 'overview'
            ORDER BY received_at DESC LIMIT 1`
          )
          .get(mp) as any
        platformData = rawData
      }

      if (platformData) {
        platforms[mp] = {
          snapshot_date: snapshot?.snapshot_date || new Date().toISOString().split('T')[0],
          impressions: platformData.impressions || 0,
          clicks: platformData.clicks || 0,
          orders: platformData.orders || 0,
          revenue: platformData.revenue || 0,
          ctr_pct: platformData.ctr_pct ?? null,
          cvr_pct: platformData.cvr_pct ?? null,
          ctr_basis: platformData.ctr_basis ?? null,
          cvr_basis: platformData.cvr_basis ?? null,
          traffic_basis: platformData.traffic_basis ?? null,
          avg_order_value: platformData.avg_order_value || 0,
          margin_pct: platformData.margin_pct || 0,
          net_profit: platformData.net_profit || 0,
          open_alerts: platformData.open_alerts || 0,
          critical_alerts: platformData.critical_alerts || 0,
          avg_rating: platformData.avg_rating || 0,
          return_rate: platformData.return_rate || 0,
          wow_change_pct: platformData.wow_change_pct || 0,
          mom_change_pct: platformData.mom_change_pct || 0,
        }

        // Track for rankings
        if (platformData.ctr_pct) metrics_ranking.ctr.push({ platform: mp, value: platformData.ctr_pct })
        if (platformData.cvr_pct) metrics_ranking.cvr.push({ platform: mp, value: platformData.cvr_pct })
        if (platformData.orders) metrics_ranking.orders.push({ platform: mp, value: platformData.orders })
        if (platformData.revenue) metrics_ranking.revenue.push({ platform: mp, value: platformData.revenue })
        if (platformData.margin_pct) metrics_ranking.margin.push({ platform: mp, value: platformData.margin_pct })
      }
    }

    // Sort rankings
    const topMetrics = {
      highest_ctr: metrics_ranking.ctr.sort((a: any, b: any) => b.value - a.value)[0],
      highest_cvr: metrics_ranking.cvr.sort((a: any, b: any) => b.value - a.value)[0],
      most_orders: metrics_ranking.orders.sort((a: any, b: any) => b.value - a.value)[0],
      highest_revenue: metrics_ranking.revenue.sort((a: any, b: any) => b.value - a.value)[0],
      highest_margin: metrics_ranking.margin.sort((a: any, b: any) => b.value - a.value)[0],
    }

    res.json({
      timestamp: new Date().toISOString(),
      snapshot_date: new Date().toISOString().split('T')[0],
      platforms,
      comparison: topMetrics,
      total_revenue: Object.values(platforms).reduce((sum: number, p: any) => sum + (p.revenue || 0), 0),
      total_orders: Object.values(platforms).reduce((sum: number, p: any) => sum + (p.orders || 0), 0),
      total_impressions: Object.values(platforms).reduce((sum: number, p: any) => sum + (p.impressions || 0), 0),
      avg_margin: (Object.values(platforms).reduce((sum: number, p: any) => sum + (p.margin_pct || 0), 0) / marketplaces.length).toFixed(2),
    })
  } catch (err) {
    console.error('[unified-dashboard] Error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// Get detailed platform comparison
router.get('/v1/dashboard/platform-comparison', (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30
    const marketplaces = ['amazon_in', 'meesho', 'snapdeal', 'flipkart']

    const now = new Date()
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const startDateStr = startDate.toISOString().split('T')[0]

    const comparison: any = {}

    for (const mp of marketplaces) {
      const records = sqlite
        .prepare(
          `SELECT * FROM metrics_platform_comparison
         WHERE marketplace = ? AND snapshot_date >= ?
         ORDER BY snapshot_date DESC`
        )
        .all(mp, startDateStr) as any[]

      if (records.length > 0) {
        const latest = records[0]
        const oldest = records[records.length - 1]

        comparison[mp] = {
          latest: {
            date: latest.snapshot_date,
            impressions: latest.impressions || 0,
            clicks: latest.clicks || 0,
            orders: latest.orders || 0,
            revenue: latest.revenue || 0,
            ctr_pct: latest.ctr_pct ?? null,
            cvr_pct: latest.cvr_pct ?? null,
            ctr_basis: latest.ctr_basis ?? null,
            cvr_basis: latest.cvr_basis ?? null,
            margin_pct: latest.margin_pct || 0,
            avg_rating: latest.avg_rating || 0,
          },
          change_30d: {
            revenue_delta: (latest.revenue || 0) - (oldest.revenue || 0),
            orders_delta: (latest.orders || 0) - (oldest.orders || 0),
            ctr_change_pct: latest.ctr_pct != null && oldest.ctr_pct != null ? (latest.ctr_pct - oldest.ctr_pct).toFixed(2) : null,
            cvr_change_pct: latest.cvr_pct != null && oldest.cvr_pct != null ? (latest.cvr_pct - oldest.cvr_pct).toFixed(2) : null,
            margin_change_pct: ((latest.margin_pct || 0) - (oldest.margin_pct || 0)).toFixed(2),
          },
          trend_data: records.map((r) => ({
            date: r.snapshot_date,
            ctr: r.ctr_pct,
            cvr: r.cvr_pct,
            orders: r.orders,
            revenue: r.revenue,
            margin: r.margin_pct,
          })),
        }
      }
    }

    res.json({
      period_days: days,
      timestamp: new Date().toISOString(),
      platforms: comparison,
    })
  } catch (err) {
    console.error('[platform-comparison] Error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// Get data quality for all platforms
router.get('/v1/data-quality/all', (_req, res) => {
  try {
    const marketplaces = ['amazon_in', 'meesho', 'snapdeal', 'flipkart']
    const qualityReport: any = {}

    for (const mp of marketplaces) {
      const report = sqlite
        .prepare(
          `SELECT * FROM data_quality_report
         WHERE marketplace = ?
         ORDER BY checked_at DESC LIMIT 1`
        )
        .get(mp) as any

      if (report) {
        qualityReport[mp] = {
          status: report.status || 'UNKNOWN',
          data_freshness_hours: report.data_freshness_hours || 0,
          collection_success_rate: report.collection_success_rate || 0,
          data_completeness_pct: report.data_completeness_pct || 0,
          last_successful_sync: report.last_successful_sync,
          last_error: report.last_error,
          checked_at: report.checked_at,
        }
      } else {
        qualityReport[mp] = {
          status: 'UNKNOWN',
          message: 'No data collected yet',
          checked_at: null,
        }
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      platforms: qualityReport,
      overall_status: Object.values(qualityReport).every((p: any) => p.status === 'HEALTHY') ? 'HEALTHY' : 'CHECK_NEEDED',
    })
  } catch (err) {
    console.error('[data-quality] Error:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
