import { Router } from 'express'
import { getTrendData, getDataQualityReport } from '../processors/trend-analytics.js'

const router = Router()

// Get trend data for a specific marketplace
router.get('/v1/trends/:marketplace', (req, res) => {
  const { marketplace } = req.params
  const days = parseInt(req.query.days as string) || 30

  const validMarketplaces = ['amazon_in', 'meesho', 'snapdeal', 'flipkart']
  if (!validMarketplaces.includes(marketplace)) {
    return res.status(400).json({ error: 'Invalid marketplace' })
  }

  const trends = getTrendData(marketplace, days)
  res.json(trends)
})

// Get all platforms trend comparison
router.get('/v1/trends/compare/all', (req, res) => {
  const days = parseInt(req.query.days as string) || 30
  const marketplaces = ['amazon_in', 'meesho', 'snapdeal', 'flipkart']

  const allTrends: any = {}
  for (const mp of marketplaces) {
    allTrends[mp] = getTrendData(mp, days)
  }

  res.json({
    period_days: days,
    platforms: allTrends,
    comparison: {
      highest_ctr: Object.entries(allTrends).reduce((max: any, [key, val]: any) => {
        const latestCTR = val.latest?.ctr_pct || 0
        return latestCTR > (max.value || 0) ? { platform: key, value: latestCTR } : max
      }, {}),
      highest_cvr: Object.entries(allTrends).reduce((max: any, [key, val]: any) => {
        const latestCVR = val.latest?.cvr_pct || 0
        return latestCVR > (max.value || 0) ? { platform: key, value: latestCVR } : max
      }, {}),
      most_orders: Object.entries(allTrends).reduce((max: any, [key, val]: any) => {
        const totalOrders = val.data.reduce((sum: number, d: any) => sum + d.orders, 0)
        return totalOrders > (max.value || 0) ? { platform: key, value: totalOrders } : max
      }, {}),
    }
  })
})

// Data quality report - verify what's being collected
router.get('/v1/trends/data-quality', (_req, res) => {
  const report = getDataQualityReport()
  res.json({
    timestamp: new Date().toISOString(),
    data_quality: report,
    summary: {
      all_active: Object.values(report).every((p: any) => p.data_status === 'ACTIVE'),
      platforms_collecting: Object.entries(report).filter(([_, p]: any) => p.data_status === 'ACTIVE').length,
    }
  })
})

export default router
