// End-to-end check of the SP-API + Ads API pollers against a *mock* of Amazon.
// It proves our request shapes and data mapping; it does NOT prove Amazon accepts them —
// only a real refresh token can do that.
import http from 'node:http'
import zlib from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const seen = { spapiCreateBody: null, adsCreateContentType: null, adsHeaders: null, tokenRequests: [] }

function readBody(req) {
  return new Promise((resolve) => {
    let d = ''
    req.on('data', (c) => (d += c))
    req.on('end', () => resolve(d))
  })
}
const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

const mock = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://mock')
  const base = `http://127.0.0.1:${mock.address().port}`
  const body = await readBody(req)

  if (url.pathname === '/auth/o2/token') {
    const p = new URLSearchParams(body)
    seen.tokenRequests.push(Object.fromEntries(p))
    if (p.get('refresh_token') !== 'good-refresh') return json(res, 400, { error: 'invalid_grant', error_description: 'bad refresh token' })
    return json(res, 200, { access_token: 'AT-123', expires_in: 3600 })
  }

  if (url.pathname.startsWith('/reports/2021-06-30') || url.pathname.startsWith('/fba/')) {
    if (req.headers['x-amz-access-token'] !== 'AT-123') return json(res, 403, { errors: [{ code: 'Unauthorized' }] })
    if (req.method === 'POST' && url.pathname === '/reports/2021-06-30/reports') {
      seen.spapiCreateBody = JSON.parse(body)
      return json(res, 202, { reportId: 'R1' })
    }
    if (url.pathname === '/reports/2021-06-30/reports/R1') return json(res, 200, { processingStatus: 'DONE', reportDocumentId: 'D1' })
    if (url.pathname === '/reports/2021-06-30/documents/D1') return json(res, 200, { url: `${base}/doc/D1`, compressionAlgorithm: 'GZIP' })
    if (url.pathname === '/fba/inventory/v1/summaries')
      return json(res, 200, { payload: { inventorySummaries: [{ sellerSku: 'TRCLHO100', totalQuantity: 120 }] } })
  }

  if (url.pathname === '/doc/D1') {
    const report = {
      salesAndTrafficByAsin: [
        {
          parentAsin: 'B0F6YRRXWJ', childAsin: 'B0F66RT2ZX', sku: 'TRCLHO100',
          trafficByAsin: { sessions: 50, pageViews: 70, buyBoxPercentage: 100 },
          salesByAsin: { unitsOrdered: 5, orderedProductSales: { amount: 800, currencyCode: 'INR' } },
        },
      ],
    }
    res.writeHead(200)
    return res.end(zlib.gzipSync(JSON.stringify(report)))
  }

  if (url.pathname.startsWith('/v2/profiles') || url.pathname.startsWith('/reporting/')) {
    if (req.headers.authorization !== 'Bearer AT-123') return json(res, 401, { code: 'UNAUTHORIZED' })
    if (url.pathname === '/v2/profiles') return json(res, 200, [{ profileId: 777, countryCode: 'IN' }])
    if (req.method === 'POST' && url.pathname === '/reporting/reports') {
      seen.adsCreateContentType = req.headers['content-type']
      seen.adsHeaders = { clientId: req.headers['amazon-advertising-api-clientid'], scope: req.headers['amazon-advertising-api-scope'] }
      return json(res, 200, { reportId: 'AR1', status: 'PENDING' })
    }
    if (url.pathname === '/reporting/reports/AR1') return json(res, 200, { status: 'COMPLETED', url: `${base}/adsdoc` })
  }

  if (url.pathname === '/adsdoc') {
    const rows = [
      { date: '2026-09-17', campaignId: 'C1', advertisedAsin: 'B0F66RT2ZX', impressions: 1000, clicks: 30, cost: 150.5, purchases14d: 3, sales14d: 456 },
    ]
    res.writeHead(200)
    return res.end(zlib.gzipSync(JSON.stringify(rows)))
  }

  json(res, 404, { error: 'mock: not found', path: url.pathname })
})
await new Promise((r) => mock.listen(0, '127.0.0.1', r))
const mockBase = `http://127.0.0.1:${mock.address().port}`

const dbPath = path.join(os.tmpdir(), `mcc-mock-test-${Date.now()}.db`)
const PORT = 4155
const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: {
    ...process.env, PORT: String(PORT), DB_PATH: dbPath, POLL_INTERVAL_MS: '86400000',
    LWA_TOKEN_URL: `${mockBase}/auth/o2/token`, SPAPI_BASE_URL: mockBase, ADS_BASE_URL: mockBase,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))

const api = (p, init) => fetch(`http://127.0.0.1:${PORT}${p}`, { headers: { 'content-type': 'application/json' }, ...init }).then((r) => r.json())
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body ?? {}) })

let failed = false
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break } catch {}
    await new Promise((r) => setTimeout(r, 500))
    if (i === 59) throw new Error('server did not start:\n' + serverLog)
  }

  // 1) Bad refresh token must surface as needs_reauth, not silently "healthy".
  await post('/v1/connections/spapi/credentials', { refresh_token: 'bad', client_id: 'cid', client_secret: 'sec' })
  const bad = await post('/v1/connections/spapi/sync')
  assert.equal(bad.ok, false, 'bad token should fail')
  let conns = (await api('/v1/connections')).connections
  assert.equal(conns.find((c) => c.source === 'spapi').status, 'needs_reauth')
  console.log('ok  bad refresh token -> needs_reauth')

  // 2) Good token: SP-API sales & traffic + inventory.
  await post('/v1/connections/spapi/credentials', { refresh_token: 'good-refresh', client_id: 'cid', client_secret: 'sec' })
  const sp = await post('/v1/connections/spapi/sync')
  assert.equal(sp.ok, true, JSON.stringify(sp))
  assert.equal(sp.listing.accepted, 1)
  assert.equal(sp.inventory.accepted, 1)
  assert.equal(seen.spapiCreateBody.reportType, 'GET_SALES_AND_TRAFFIC_REPORT')
  assert.deepEqual(seen.spapiCreateBody.marketplaceIds, ['A21TJRUUN4KGV'])
  assert.deepEqual(seen.spapiCreateBody.reportOptions, { dateGranularity: 'DAY', asinGranularity: 'CHILD' })
  console.log('ok  SP-API: report requested with CHILD/DAY options, 1 listing + 1 inventory row ingested')

  // 3) Ads API.
  await post('/v1/connections/ads_api/credentials', { refresh_token: 'good-refresh', client_id: 'ads-cid', client_secret: 'sec' })
  const ads = await post('/v1/connections/ads_api/sync')
  assert.equal(ads.ok, true, JSON.stringify(ads))
  assert.equal(ads.accepted, 1)
  assert.equal(seen.adsCreateContentType, 'application/vnd.createasyncreportrequest.v3+json')
  assert.deepEqual(seen.adsHeaders, { clientId: 'ads-cid', scope: '777' })
  console.log('ok  Ads API: vendor content-type + ClientId + Scope(profile) headers sent, 1 ads row ingested')

  // 4) What actually landed in the warehouse.
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const listing = db.prepare("SELECT sessions, buy_box_pct, ordered_product_sales, data_quality FROM fact_listing_daily WHERE asin='B0F66RT2ZX'").get()
  assert.deepEqual({ ...listing }, { sessions: 50, buy_box_pct: 100, ordered_product_sales: 800, data_quality: 'api' })
  const adRow = db.prepare("SELECT spend, ad_sales, data_quality FROM fact_ads_daily WHERE asin='B0F66RT2ZX'").get()
  assert.deepEqual({ ...adRow }, { spend: 150.5, ad_sales: 456, data_quality: 'api' })
  const inv = db.prepare("SELECT available FROM fact_inventory_daily WHERE sku='TRCLHO100'").get()
  assert.equal(inv.available, 120)
  conns = (await api('/v1/connections')).connections
  assert.equal(conns.find((c) => c.source === 'spapi').status, 'healthy')
  assert.equal(conns.find((c) => c.source === 'ads_api').status, 'healthy')
  db.close()
  console.log('ok  warehouse rows correct, data_quality=api, both connections healthy')

  console.log('\nMOCK-AMAZON OK  (verifies our side only — real Amazon still needs your credentials)')
} catch (err) {
  failed = true
  console.error('\nMOCK-AMAZON FAILED:', err.message)
  if (serverLog) console.error('--- server log ---\n' + serverLog.slice(-1500))
} finally {
  server.kill()
  mock.close()
  await new Promise((r) => setTimeout(r, 300))
  for (const ext of ['', '-wal', '-shm']) fs.rmSync(dbPath + ext, { force: true })
  process.exit(failed ? 1 : 0)
}
