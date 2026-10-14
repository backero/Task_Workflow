import { sqlite } from './db/client.js'
import { sendAlertEmail } from './notifications/email.js'

// Design Addendum v1.2 §2.3: "SaaS health monitor alerts you within 1 hour of a failed pull".
// Robo reports a heartbeat after every pass, but nothing noticed when it STOPPED reporting —
// a laptop that was off, a crashed task, or a server that was down at the wrong moment left the
// Connections page saying "healthy" indefinitely (it did for 18 hours once).

const [OPEN_H, OPEN_M] = (process.env.EDGE_BUSINESS_START ?? '09:00').split(':').map(Number)
const [CLOSE_H, CLOSE_M] = (process.env.EDGE_BUSINESS_END ?? '19:00').split(':').map(Number)
// Robo passes every ~4 h inside business hours, so 6 h of business time without a word = missed a pass.
export const SILENT_AFTER_BUSINESS_MINUTES = Number(process.env.EDGE_SILENT_AFTER_MINUTES ?? 360)

/** Minutes of business hours (server-local clock) between two instants. Overnight idleness isn't silence. */
export function businessMinutesBetween(fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0
  let total = 0
  const day = new Date(fromMs)
  day.setHours(0, 0, 0, 0)
  while (day.getTime() < toMs) {
    const open = new Date(day); open.setHours(OPEN_H, OPEN_M, 0, 0)
    const close = new Date(day); close.setHours(CLOSE_H, CLOSE_M, 0, 0)
    const lo = Math.max(open.getTime(), fromMs)
    const hi = Math.min(close.getTime(), toMs)
    if (hi > lo) total += (hi - lo) / 60_000
    day.setDate(day.getDate() + 1)
  }
  return total
}

export type EdgeHealth = {
  state: 'healthy' | 'silent' | 'needs_reauth' | 'error' | 'never'
  last_seen_at: string | null
  silent_business_minutes: number | null
  message: string | null
}

export function edgeAgentHealth(now = Date.now()): EdgeHealth {
  const row = sqlite
    .prepare("SELECT status, last_seen_at, last_error FROM connections WHERE source = 'edge_agent'")
    .get() as { status: string; last_seen_at: string | null; last_error: string | null } | undefined
  if (!row || !row.last_seen_at) return { state: 'never', last_seen_at: null, silent_business_minutes: null, message: 'Robo has never reported in.' }

  const silent = businessMinutesBetween(Date.parse(row.last_seen_at), now)
  if (silent > SILENT_AFTER_BUSINESS_MINUTES) {
    const hours = (silent / 60).toFixed(1)
    return {
      state: 'silent',
      last_seen_at: row.last_seen_at,
      silent_business_minutes: Math.round(silent),
      message: `No word from Robo for ${hours} business hours — is the laptop on and the "MCC Edge Agent (Robo)" task running?`,
    }
  }
  const state = row.status === 'needs_reauth' || row.status === 'error' ? row.status : 'healthy'
  return { state, last_seen_at: row.last_seen_at, silent_business_minutes: Math.round(silent), message: row.last_error }
}

let alertedForHeartbeat: string | null = null

/** Runs on a timer: turns a silent Robo into a visible error state plus one email per outage. */
export async function checkRoboHealth() {
  const health = edgeAgentHealth()
  if (health.state !== 'silent') { alertedForHeartbeat = null; return }
  if (alertedForHeartbeat === health.last_seen_at) return // already told them about this outage
  alertedForHeartbeat = health.last_seen_at

  sqlite
    .prepare("UPDATE connections SET status = 'error', last_error = ?, updated_at = ? WHERE source = 'edge_agent' AND status = 'healthy'")
    .run(health.message, new Date().toISOString())
  console.warn(`[health] ${health.message}`)
  await sendAlertEmail([
    { title: 'Robo has gone silent', message: health.message ?? '', suggestedAction: 'Check the dedicated laptop: powered on, online, and the scheduled task running.', severity: 'red' },
  ]).catch(() => {})
}
