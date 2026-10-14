// Run: npx tsx --test test/robots.test.ts
// Amazon Robo's view: reported runs, heartbeat state, and the fact that this site knows nothing about Flipkart.
// Scratch server + scratch database only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('scratch server: Amazon Robo reports runs, /v1/robot shows only Amazon Robo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robots-test-'))
  const port = 4800 + Math.floor(Math.random() * 90)
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.resolve(import.meta.dirname, '..'), stdio: 'ignore',
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(dir, 'mcc.db') },
  })
  try {
    const base = `http://127.0.0.1:${port}`
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) break } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 500)) }
    const post = (url: string, body: unknown) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const get = async (url: string) => (await fetch(base + url)).json() as Promise<any>
    const now = new Date().toISOString()

    // Robo has never reported
    let v = await get('/v1/robot')
    assert.equal(v.id, 'amazon')
    assert.equal(v.name, 'Amazon Robo')
    assert.equal(v.state, 'never')

    // No trace of another marketplace's robot or comparison on this site
    assert.equal((await fetch(base + '/v1/robots')).status, 404)
    assert.equal((await fetch(base + '/v1/compare')).status, 404)

    // a bad report is refused
    assert.equal((await post('/v1/robot/runs', { job: 'made_up', started_at: now, finished_at: now, status: 'ok' })).status, 400)

    // Robo checks in and reports jobs: everything ok
    assert.equal((await post('/v1/connections/edge_agent/heartbeat', { status: 'healthy' })).status, 200)
    assert.equal((await post('/v1/robot/runs', { job: 'business_report', started_at: now, finished_at: now, status: 'ok', detail: '3 day(s) uploaded', every_minutes: 240 })).status, 200)
    v = await get('/v1/robot')
    assert.equal(v.state, 'healthy')
    const report = v.jobs.find((j: any) => j.id === 'business_report')
    assert.equal(report.last_status, 'ok')
    assert.equal(report.enabled, true)
    assert.equal(v.jobs.find((j: any) => j.id === 'ads_report').enabled, false)   // never reported -> not "overdue"
    assert.equal(v.runs.length, 1)

    // A failing step shows even though Robo's own heartbeat says healthy
    await post('/v1/robot/runs', { job: 'snapshots', started_at: now, finished_at: now, status: 'failed', detail: 'inventory page layout changed', every_minutes: 180 })
    v = await get('/v1/robot')
    assert.equal(v.state, 'error')
    assert.match(v.message, /Account health, stock & ads check failed: inventory page layout changed/)

    // Sign-in needed outranks a plain failure
    await post('/v1/robot/runs', { job: 'business_report', started_at: now, finished_at: now, status: 'needs_you', detail: 'sign in', every_minutes: 240 })
    v = await get('/v1/robot')
    assert.equal(v.state, 'needs_you')
  } finally {
    child.kill()
    await new Promise((r) => setTimeout(r, 500))
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* Windows may still hold the file; it is a temp dir */ }
  }
})
