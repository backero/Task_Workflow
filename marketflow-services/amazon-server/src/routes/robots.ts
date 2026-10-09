import { Router } from 'express'
import { z } from 'zod'
import { sqlite } from '../db/client.js'
import { businessMinutesBetween, edgeAgentHealth } from '../health.js'

// Amazon Robo — what it is, whether it is alive, what each of its jobs just did and how it ended.
// This site knows nothing about any other marketplace: Flipkart has its own robot and its own dashboard.
//   states: healthy · attention · needs_you · error · silent · never
//   job outcomes: ok · partial · skipped · needs_you · failed
// Robo reports on itself (each job run + a heartbeat). The server only adds what Robo cannot say about itself:
// that it has gone silent, and that a job is overdue.
const router = Router()

const JOBS: Record<string, { label: string; what: string }> = {
  business_report: { label: 'Sales & traffic report', what: 'Downloads the Seller Central Business Report for the last few days (sessions, page views, Buy Box, units, sales).' },
  snapshots: { label: 'Account health, stock & ads check', what: 'Reads Account Health, Manage Inventory (status, stock, fees) and the Ads console from Seller Central.' },
  ads_report: { label: 'Ads report', what: 'Downloads the Sponsored Ads report per product and campaign.' },
  public_sweep: { label: 'Storefront sweep', what: 'Visits amazon.in logged out: our prices, ratings and BSR, rivals, and keyword rank / share of search.' },
}

const runBody = z.object({
  job: z.enum(['business_report', 'snapshots', 'ads_report', 'public_sweep']),
  started_at: z.string().min(10),
  finished_at: z.string().min(10),
  status: z.enum(['ok', 'partial', 'skipped', 'needs_you', 'failed']),
  detail: z.string().max(500).optional(),
  every_minutes: z.number().positive().optional(),
})

// Robo reports each job it ran. Best-effort on Robo's side; the server keeps 30 days.
router.post('/v1/robot/runs', (req, res) => {
  const parsed = runBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  const r = parsed.data
  sqlite.prepare('INSERT INTO robot_runs (robot, job, started_at, finished_at, status, detail, every_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('amazon', r.job, r.started_at, r.finished_at, r.status, r.detail ?? null, r.every_minutes ?? null)
  sqlite.prepare("DELETE FROM robot_runs WHERE finished_at < datetime('now', '-30 days')").run()
  res.json({ ok: true })
})

export type RobotState = 'healthy' | 'attention' | 'needs_you' | 'error' | 'silent' | 'never'
export type RobotJob = {
  id: string; label: string; what: string; every_minutes: number | null; enabled: boolean
  last_run: string | null; last_status: string | null; detail: string | null; duration_s: number | null; overdue: boolean
}
export type RobotRun = { finished_at: string; job: string; status: string; detail: string | null; duration_s: number | null }
export type AmazonRobot = { state: RobotState; message: string; beat: string | null; jobs: RobotJob[]; runs: RobotRun[] }

/** Amazon Robo's view: its heartbeat state, then its jobs from the runs it has reported. */
export function amazonRobot(now = Date.now()): AmazonRobot {
  const h = edgeAgentHealth(now)
  const latest = sqlite.prepare(`
    SELECT job, status, detail, finished_at, every_minutes,
           (julianday(finished_at) - julianday(started_at)) * 86400 AS duration_s
    FROM robot_runs WHERE robot = 'amazon' AND id IN (SELECT MAX(id) FROM robot_runs WHERE robot = 'amazon' GROUP BY job)
  `).all() as { job: string; status: string; detail: string | null; finished_at: string; every_minutes: number | null; duration_s: number | null }[]
  const byJob = new Map(latest.map((r) => [r.job, r]))

  const jobs: RobotJob[] = Object.entries(JOBS).map(([id, meta]) => {
    const r = byJob.get(id)
    // A job Robo has never reported (e.g. the ads report, switched off) is not "overdue" — there is nothing to be late for.
    const overdue = !!r && r.every_minutes != null && businessMinutesBetween(Date.parse(r.finished_at), now) > r.every_minutes * 1.5 + 10
    return {
      id, label: meta.label, what: meta.what, every_minutes: r?.every_minutes ?? null, enabled: !!r,
      last_run: r?.finished_at ?? null, last_status: r?.status ?? null, detail: r?.detail ?? null,
      duration_s: r?.duration_s != null ? Math.round(r.duration_s * 10) / 10 : null, overdue,
    }
  })
  const runs = sqlite.prepare("SELECT finished_at, job, status, detail, (julianday(finished_at) - julianday(started_at)) * 86400 AS duration_s FROM robot_runs WHERE robot = 'amazon' ORDER BY id DESC LIMIT 30").all() as RobotRun[]

  // Heartbeat state first (silent / needs sign-in / error), then what the jobs say.
  let state = (h.state === 'needs_reauth' ? 'needs_you' : h.state) as RobotState
  let message = h.message ?? (state === 'healthy' ? 'All jobs are running on schedule.' : '')
  if (state === 'needs_you') message = message || 'Seller Central needs you to sign in again (OTP on your phone).'
  if (state === 'healthy' || state === 'attention') {
    const failed = jobs.find((j) => j.last_status === 'failed')
    const needs = jobs.find((j) => j.last_status === 'needs_you')
    const late = jobs.find((j) => j.overdue)
    const partial = jobs.find((j) => j.last_status === 'partial')
    if (needs) { state = 'needs_you'; message = `${needs.label}: ${needs.detail ?? 'needs you'}` }
    else if (failed) { state = 'error'; message = `${failed.label} failed: ${failed.detail ?? 'see the log'}` }
    else if (late) { state = 'error'; message = `${late.label} has not run for a long time (expected every ${Math.round((late.every_minutes ?? 0) / 60 * 10) / 10} hours).` }
    else if (partial) { state = 'attention'; message = `${partial.label}: ${partial.detail ?? 'partly done'}` }
  }
  return { state, message, beat: h.last_seen_at, jobs, runs }
}

router.get('/v1/robot', (_req, res) => {
  res.json({
    id: 'amazon', name: 'Amazon Robo', platform: 'Amazon India',
    how: 'Runs on this laptop in a browser you sign in to once (Seller Central). Task: "MCC Edge Agent (Robo)". Log: amazon/edge-agent/logs/agent.log.',
    ...amazonRobot(),
  })
})

export default router
