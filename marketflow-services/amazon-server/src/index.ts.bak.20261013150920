import 'dotenv/config'
import './db/init.js'
import express from 'express'
import cors from 'cors'
import ingestRouter from './routes/ingest.js'
import dashboardRouter from './routes/dashboard.js'
import connectionsRouter from './routes/connections.js'
import importRouter from './routes/import.js'
import productsRouter from './routes/products.js'
import trackingRouter from './routes/tracking.js'
import robotsRouter from './routes/robots.js'
import profitabilityRouter from './routes/profitability.js'
import alertsRouter from './routes/alerts.js'
import trendsRouter from './routes/trends.js'
import unifiedDashboardRouter from './routes/unified-dashboard.js'
import insightsRecommendationsRouter from './routes/insights-recommendations.js'
import { startScheduler } from './scheduler.js'
import { createAiInsightsTable } from './processors/ai-insights.js'
import { startBackupScheduler, getBackupStatus } from './services/backup.js'
import { listBackups, restoreFromBackup, getBackupStats } from './services/restore.js'
import { captureUnifiedPlatformSnapshot } from './processors/unified-snapshot.js'
import { runTrendCapture } from './processors/trend-analytics.js'
import { runAIAnalysisEngine } from './processors/ai-analysis-engine.js'
import { generateRecommendations } from './processors/recommendations-engine.js'
import { monitorDataQuality } from './processors/data-quality-monitor.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '5mb' }))

// Manual processor trigger for testing/demo
app.post('/v1/admin/trigger-processors', (_req, res) => {
  try {
    console.log('[admin] Manually triggering all processors')

    const trends = runTrendCapture()
    const snapshot = captureUnifiedPlatformSnapshot()
    const quality = monitorDataQuality()
    const analysis = runAIAnalysisEngine()
    const recommendations = generateRecommendations()

    res.json({
      success: true,
      processors_triggered: {
        trends,
        snapshot,
        quality,
        analysis,
        recommendations
      },
      message: 'All processors executed. Refresh dashboard in 2-3 seconds.'
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/health', (_req, res) => res.json({ ok: true }))
app.get('/v1/backup/status', (_req, res) => res.json(getBackupStatus()))
app.get('/v1/backup/stats', (_req, res) => res.json(getBackupStats()))
app.get('/v1/backup/list', (_req, res) => res.json(listBackups()))
app.post('/v1/backup/restore', (req, res) => {
  const { backupFile } = req.body
  if (!backupFile) {
    return res.status(400).json({ error: 'backupFile parameter required' })
  }
  restoreFromBackup(backupFile).then(result => res.json(result))
})

// Initialize AI tables
createAiInsightsTable()

app.use(ingestRouter)
app.use(dashboardRouter)
app.use(connectionsRouter)
app.use(importRouter)
app.use(productsRouter)
app.use(trackingRouter)
app.use(robotsRouter)
app.use(profitabilityRouter)
app.use(alertsRouter)
app.use(trendsRouter)
app.use(unifiedDashboardRouter)
app.use(insightsRecommendationsRouter)

const port = Number(process.env.PORT ?? 4000)
// Loopback only by default: this server holds real seller data + Amazon refresh tokens and
// has no login. Set HOST=0.0.0.0 only behind something that adds authentication.
const host = process.env.HOST ?? '127.0.0.1'

process.on('unhandledRejection', (reason) => {
  console.error('[error] Unhandled rejection:', reason instanceof Error ? reason.message : reason)
})
process.on('uncaughtException', (error) => {
  console.error('[error] Uncaught exception:', error.message)
  setTimeout(() => process.exit(1), 100)
})

app.listen(port, host, () => {
  console.log(`[mcc-server] listening on http://${host}:${port}`)
  startScheduler()
  startBackupScheduler()
})
