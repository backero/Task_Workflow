import { Router } from 'express'
import { z } from 'zod'
import { sqlite } from '../db/client.js'
import { runSpapiPoller } from '../pollers/spapiPoller.js'
import { runAdsPoller } from '../pollers/adsPoller.js'
import { edgeAgentHealth } from '../health.js'

const router = Router()

const SOURCES = ['spapi', 'ads_api', 'edge_agent'] as const

function ensureRow(source: string) {
  const existing = sqlite.prepare('SELECT source FROM connections WHERE source = ?').get(source)
  if (!existing) {
    sqlite.prepare('INSERT INTO connections (source, status) VALUES (?, ?)').run(source, 'not_connected')
  }
}

for (const s of SOURCES) ensureRow(s)

router.get('/v1/connections', (_req, res) => {
  const rows = sqlite.prepare('SELECT source, status, last_seen_at, last_error, updated_at, credentials_json FROM connections').all() as any[]
  res.json({
    connections: rows.map((r) => ({
      source: r.source,
      status: r.status,
      last_seen_at: r.last_seen_at,
      last_error: r.last_error,
      updated_at: r.updated_at,
      // never echo raw credentials back to the client
      has_credentials: !!r.credentials_json,
      // Robo: derived from how long it has been silent, not just its last self-reported status
      health: r.source === 'edge_agent' ? edgeAgentHealth() : null,
    })),
  })
})

// Called by the Edge Agent uploader (or a real SP-API/Ads API poller once wired) to
// report health. This is intentionally the only "write" a collector can do to its
// own connection row — it never touches credentials.
router.post('/v1/connections/:source/heartbeat', (req, res) => {
  const { source } = req.params
  if (!SOURCES.includes(source as any)) return res.status(404).json({ error: 'unknown source' })
  const schema = z.object({ status: z.enum(['healthy', 'needs_reauth', 'error']), error: z.string().optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  sqlite.prepare(`
    UPDATE connections SET status = ?, last_seen_at = ?, last_error = ?, updated_at = ? WHERE source = ?
  `).run(parsed.data.status, new Date().toISOString(), parsed.data.error ?? null, new Date().toISOString(), source)

  res.json({ ok: true })
})

// Stores a self-authorization refresh token per Design Addendum v1.1 Option C.
// Status goes to 'needs_reauth' until the next sync proves the credentials work —
// that's what flips it to 'healthy' (or back to an error state).
router.post('/v1/connections/:source/credentials', (req, res) => {
  const { source } = req.params
  if (source !== 'spapi' && source !== 'ads_api') return res.status(404).json({ error: 'unknown source' })
  const schema = z.object({ refresh_token: z.string().min(1), client_id: z.string().optional(), client_secret: z.string().optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  sqlite.prepare(`
    UPDATE connections SET credentials_json = ?, status = 'needs_reauth', updated_at = ? WHERE source = ?
  `).run(JSON.stringify(parsed.data), new Date().toISOString(), source)

  res.json({ ok: true, note: 'Credentials stored. Click "Sync now" to run a live fetch.' })
})

// Runs one fetch cycle immediately instead of waiting for the daily scheduler
// (see scheduler.ts) — mainly so a freshly-saved credential can be verified right away.
router.post('/v1/connections/:source/sync', async (req, res) => {
  const { source } = req.params
  if (source !== 'spapi' && source !== 'ads_api') return res.status(404).json({ error: 'unknown source' })

  const result = source === 'spapi' ? await runSpapiPoller() : await runAdsPoller()
  res.json(result)
})

export default router
