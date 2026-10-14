import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const BACKUP_DIR = path.join(os.homedir(), 'Documents', 'Backups', 'marketplace-automation')

export async function restoreFromBackup(backupFile: string) {
  try {
    const backupPath = path.join(BACKUP_DIR, backupFile)

    if (!fs.existsSync(backupPath)) {
      return {
        success: false,
        error: `Backup file not found: ${backupPath}`
      }
    }

    // Parse backup type
    if (backupFile.endsWith('.db')) {
      return await restoreDatabase(backupPath)
    } else if (backupFile.endsWith('.json')) {
      return await restoreJSON(backupPath)
    }

    return {
      success: false,
      error: 'Unknown backup file type'
    }
  } catch (err) {
    return {
      success: false,
      error: String(err)
    }
  }
}

async function restoreDatabase(backupPath: string) {
  try {
    const dbPath = 'amazon/server/mcc.db'
    const restorePath = `${dbPath}.restore_${Date.now()}`

    // Create backup of current database before restoring
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, restorePath)
      console.log(`[restore] Current database backed up to: ${restorePath}`)
    }

    // Restore from backup
    fs.copyFileSync(backupPath, dbPath)

    return {
      success: true,
      message: 'Database restored successfully',
      restored_from: backupPath,
      previous_backup: restorePath,
      timestamp: new Date().toISOString()
    }
  } catch (err) {
    return {
      success: false,
      error: String(err)
    }
  }
}

async function restoreJSON(backupPath: string) {
  try {
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'))

    return {
      success: true,
      message: 'JSON backup loaded successfully',
      data_summary: backupData.metadata || {},
      backed_up_at: backupData.backup_timestamp,
      can_be_used_for: [
        'Analysis and reporting',
        'Data verification',
        'Manual recovery if needed',
        'Acquisition due diligence'
      ]
    }
  } catch (err) {
    return {
      success: false,
      error: String(err)
    }
  }
}

export function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return {
        success: false,
        error: 'Backup directory not found'
      }
    }

    const folders = fs.readdirSync(BACKUP_DIR)
    const backups: any[] = []

    for (const folder of folders) {
      const folderPath = path.join(BACKUP_DIR, folder)
      const stats = fs.statSync(folderPath)

      if (stats.isDirectory()) {
        const files = fs.readdirSync(folderPath)
        const fileDetails = files.map(file => ({
          name: file,
          size: fs.statSync(path.join(folderPath, file)).size,
          type: file.includes('.db') ? 'database' : file.includes('.json') ? 'json' : 'csv'
        }))

        backups.push({
          date: folder,
          files: fileDetails,
          total_files: files.length,
          total_size: fileDetails.reduce((sum, f) => sum + f.size, 0)
        })
      }
    }

    return {
      success: true,
      backup_location: BACKUP_DIR,
      total_backup_dates: backups.length,
      backups: backups.sort((a, b) => b.date.localeCompare(a.date))
    }
  } catch (err) {
    return {
      success: false,
      error: String(err)
    }
  }
}

export function getBackupStats() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return {
        status: 'not_configured',
        message: `Backups directory not initialized yet: ${BACKUP_DIR}`
      }
    }

    let totalSize = 0
    let totalFiles = 0
    let oldestBackup: string | null = null
    let newestBackup: string | null = null

    const folders = fs.readdirSync(BACKUP_DIR)

    for (const folder of folders) {
      const folderPath = path.join(BACKUP_DIR, folder)
      const stats = fs.statSync(folderPath)

      if (stats.isDirectory()) {
        if (!oldestBackup) oldestBackup = folder
        newestBackup = folder

        const files = fs.readdirSync(folderPath)
        totalFiles += files.length

        for (const file of files) {
          totalSize += fs.statSync(path.join(folderPath, file)).size
        }
      }
    }

    return {
      status: 'active',
      backup_location: BACKUP_DIR,
      total_backup_days: folders.length,
      total_files: totalFiles,
      total_size_mb: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      oldest_backup: oldestBackup,
      newest_backup: newestBackup,
      next_backup_in: 'Every hour',
      includes: [
        'SQLite database',
        'Analytics metrics (JSON)',
        'Orders & settlements',
        'Alerts & insights',
        'CSV exports for Excel'
      ]
    }
  } catch (err) {
    return {
      status: 'error',
      error: String(err)
    }
  }
}
