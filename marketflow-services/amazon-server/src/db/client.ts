import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../../data')
fs.mkdirSync(dataDir, { recursive: true })

const dbPath = process.env.DB_PATH ?? path.join(dataDir, 'mcc.db')
export const sqlite = new DatabaseSync(dbPath)
sqlite.exec('PRAGMA journal_mode = WAL')
sqlite.exec('PRAGMA foreign_keys = ON')

/** node:sqlite has no built-in transaction helper (unlike better-sqlite3) — wrap manually. */
export function withTransaction<T>(fn: () => T): T {
  sqlite.exec('BEGIN')
  try {
    const result = fn()
    sqlite.exec('COMMIT')
    return result
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}
