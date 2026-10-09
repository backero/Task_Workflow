import fs from 'fs'
import path from 'path'
import os from 'os'
import { sqlite } from '../db/client.js'

// Backup to user's Documents folder (most reliable location with permissions)
const BACKUP_DIR = path.join(os.homedir(), 'Documents', 'Backups', 'marketplace-automation')
const TIMESTAMP_FORMAT = 'YYYY-MM-DD_HH-mm-ss'

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }
}

function getTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${date}_${hours}-${minutes}-${seconds}`
}

function getDateFolder(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
}

export function backupDatabase() {
  try {
    ensureBackupDir()

    const dateFolder = getDateFolder()
    const dayDir = path.join(BACKUP_DIR, dateFolder)
    const timestamp = getTimestamp()

    if (!fs.existsSync(dayDir)) {
      fs.mkdirSync(dayDir, { recursive: true })
    }

    // Backup SQLite database
    const dbPath = path.join(dayDir, `database_${timestamp}.db`)
    const dbSourcePath = 'amazon/server/mcc.db'

    if (fs.existsSync(dbSourcePath)) {
      fs.copyFileSync(dbSourcePath, dbPath)
      console.log(`[backup] Database backed up: ${dbPath}`)
    }

    // Export all analytics data
    const profitabilityData = sqlite.prepare(`
      SELECT * FROM metrics_product_profitability ORDER BY calculated_at DESC LIMIT 1000
    `).all()

    const alertsData = sqlite.prepare(`
      SELECT * FROM alerts ORDER BY fired_at DESC LIMIT 500
    `).all()

    const aiInsightsData = sqlite.prepare(`
      SELECT * FROM ai_insights ORDER BY generated_at DESC LIMIT 100
    `).all()

    const regionalData = sqlite.prepare(`
      SELECT * FROM metrics_regional_performance ORDER BY calculated_at DESC LIMIT 500
    `).all()

    const ltv = sqlite.prepare(`
      SELECT * FROM fact_customer_repeat ORDER BY cohort_month DESC LIMIT 500
    `).all()

    const ordersData = sqlite.prepare(`
      SELECT * FROM fact_order ORDER BY order_date DESC LIMIT 5000
    `).all()

    const settlementsData = sqlite.prepare(`
      SELECT * FROM fact_settlement ORDER BY settlement_date DESC LIMIT 1000
    `).all()

    // Create comprehensive JSON backup
    const backupData = {
      backup_timestamp: new Date().toISOString(),
      database: {
        profitability_metrics: profitabilityData,
        alerts: alertsData,
        ai_insights: aiInsightsData,
        regional_performance: regionalData,
        customer_ltv: ltv,
      },
      transactions: {
        orders: ordersData,
        settlements: settlementsData,
      },
      metadata: {
        total_profitability_records: profitabilityData.length,
        total_alerts: alertsData.length,
        total_insights: aiInsightsData.length,
        total_orders: ordersData.length,
        backup_version: '1.0',
      }
    }

    const jsonPath = path.join(dayDir, `analytics_${timestamp}.json`)
    fs.writeFileSync(jsonPath, JSON.stringify(backupData, null, 2))
    console.log(`[backup] Analytics exported: ${jsonPath}`)

    // Export CSV for spreadsheets
    const csvData = {
      profitability: convertToCSV(profitabilityData, ['sku', 'marketplace', 'units_sold', 'gross_revenue', 'total_fees', 'net_profit', 'margin_pct', 'return_rate']),
      alerts: convertToCSV(alertsData, ['rule_id', 'title', 'severity', 'fired_at', 'scope_id']),
      regional: convertToCSV(regionalData, ['region', 'marketplace', 'total_orders', 'total_revenue', 'return_rate']),
      orders: convertToCSV(ordersData, ['order_date', 'marketplace', 'sku', 'quantity', 'order_price', 'return_flag']),
    }

    for (const [name, csv] of Object.entries(csvData)) {
      const csvPath = path.join(dayDir, `${name}_${timestamp}.csv`)
      fs.writeFileSync(csvPath, csv)
      console.log(`[backup] CSV exported: ${csvPath}`)
    }

    // Create summary report
    const summary = {
      backup_time: new Date().toISOString(),
      location: BACKUP_DIR,
      files_created: [
        `database_${timestamp}.db`,
        `analytics_${timestamp}.json`,
        `profitability_${timestamp}.csv`,
        `alerts_${timestamp}.csv`,
        `regional_${timestamp}.csv`,
        `orders_${timestamp}.csv`,
      ],
      metrics: {
        total_products_tracked: sqlite.prepare('SELECT COUNT(DISTINCT sku) as count FROM metrics_product_profitability').get().count,
        total_orders: sqlite.prepare('SELECT COUNT(*) as count FROM fact_order').get().count,
        open_alerts: sqlite.prepare("SELECT COUNT(*) as count FROM alerts WHERE status = 'open'").get().count,
        total_insights: sqlite.prepare('SELECT COUNT(*) as count FROM ai_insights').get().count,
      }
    }

    const summaryPath = path.join(dayDir, `backup_summary_${timestamp}.json`)
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
    console.log(`[backup] Backup complete! Summary: ${summaryPath}`)

    return { success: true, timestamp, location: dayDir }
  } catch (err) {
    console.error('[backup] Error:', err)
    return { success: false, error: String(err) }
  }
}

function convertToCSV(data: any[], columns: string[]): string {
  if (!data.length) return columns.join(',')

  const header = columns.join(',')
  const rows = data.map(row =>
    columns.map(col => {
      const value = row[col]
      if (value === null || value === undefined) return ''
      if (typeof value === 'string' && value.includes(',')) return `"${value}"`
      return String(value)
    }).join(',')
  )

  return [header, ...rows].join('\n')
}

export function startBackupScheduler() {
  console.log('[scheduler] Backup scheduler started - hourly backups to D:/Backups/marketplace-automation')

  // Run immediately on startup
  backupDatabase()

  // Run every hour
  setInterval(() => {
    backupDatabase()
  }, 60 * 60 * 1000)
}

export function getBackupStatus() {
  try {
    ensureBackupDir()

    if (!fs.existsSync(BACKUP_DIR)) {
      return {
        status: 'not_configured',
        message: 'Backup directory does not exist'
      }
    }

    const folders = fs.readdirSync(BACKUP_DIR)
    const totalSize = getDirectorySize(BACKUP_DIR)

    return {
      status: 'active',
      backup_directory: BACKUP_DIR,
      total_days_backed_up: folders.length,
      total_backup_size: formatBytes(totalSize),
      recent_backups: folders.slice(-5).reverse(),
    }
  } catch (err) {
    return {
      status: 'error',
      error: String(err)
    }
  }
}

function getDirectorySize(dir: string): number {
  let size = 0
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stats = fs.statSync(filePath)

    if (stats.isDirectory()) {
      size += getDirectorySize(filePath)
    } else {
      size += stats.size
    }
  }

  return size
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}
