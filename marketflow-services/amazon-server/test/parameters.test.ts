// Run: npx tsx --test test/parameters.test.ts
// Behaviour checks for the Parameter Reference rules that were tightened on 2026-09-25. Scratch database only.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'params-test-'))
process.env.DB_PATH = path.join(dir, 'mcc.db')

let sqlite: any, runRulesEngine: () => unknown, base = '', server: http.Server

before(async () => {
  await import('../src/db/init.js')
  sqlite = (await import('../src/db/client.js')).sqlite
  runRulesEngine = (await import('../src/rules/engine.js')).runRulesEngine
  const express = (await import('express')).default
  const dashboard = (await import('../src/routes/dashboard.js')).default
  const app = express(); app.use(dashboard)
  server = await new Promise<http.Server>((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
  base = `http://127.0.0.1:${(server.address() as any).port}`
  for (const [asin, sku] of [['B0AAAAAAA1', 'S1'], ['B0AAAAAAA2', 'S2'], ['B0AAAAAAA3', 'S3'], ['B0AAAAAAA4', 'S4']])
    sqlite.prepare("INSERT INTO dim_product (asin, sku, name, category, marketplace_code, price, is_own) VALUES (?, ?, ?, 'x', 'IN', 200, 1)").run(asin, sku, `Product ${sku}`)
})

const rankAlerts = () => sqlite.prepare("SELECT scope_id, message, evidence_json FROM alerts WHERE rule_id = 'search_rank_guard' AND status = 'open'").all() as any[]
const addKw = (k: string, hero = 0) => sqlite.prepare('INSERT OR IGNORE INTO dim_keyword (keyword, is_hero_target) VALUES (?, ?)').run(k, hero)
const rank = (k: string, asin: string, date: string, r: number) => sqlite.prepare('INSERT INTO fact_keyword_rank_daily (keyword, asin, date, organic_rank) VALUES (?, ?, ?, ?)').run(k, asin, date, r)
const swept = (k: string, date: string) => sqlite.prepare('INSERT OR REPLACE INTO fact_search_share (keyword, date, top_n, organic_results, own_organic, sponsored_results, own_sponsored) VALUES (?, ?, 16, 16, 0, 0, 0)').run(k, date)

test('RULE-RANK: a keyword we held in the top 5 that is now worse than 10 — including dropped off entirely', () => {
  // A1 was #3, now absent from a swept results page -> fires ("no longer appears")
  addKw('kw dropped'); rank('kw dropped', 'B0AAAAAAA1', '2026-09-20', 3); swept('kw dropped', '2026-09-25')
  // A2 was #3, now #8 -> still top 10, no alert
  addKw('kw slipped'); rank('kw slipped', 'B0AAAAAAA2', '2026-09-20', 3); rank('kw slipped', 'B0AAAAAAA2', '2026-09-25', 8); swept('kw slipped', '2026-09-25')
  // A3 was #4, now #12 -> fires
  addKw('kw fell'); rank('kw fell', 'B0AAAAAAA3', '2026-09-20', 4); rank('kw fell', 'B0AAAAAAA3', '2026-09-25', 12); swept('kw fell', '2026-09-25')
  // A4 never above #12 and not a hero keyword -> nothing to fall from
  addKw('kw never'); rank('kw never', 'B0AAAAAAA4', '2026-09-20', 12); rank('kw never', 'B0AAAAAAA4', '2026-09-25', 14); swept('kw never', '2026-09-25')
  // keyword not swept for this ASIN's history at all -> silent
  addKw('kw unswept')
  // hero keyword, ranked 15 today with no history: guarded because it is a hero target
  addKw('kw hero', 1); rank('kw hero', 'B0AAAAAAA1', '2026-09-25', 15); swept('kw hero', '2026-09-25')
  // a page that was only fetched long ago must not count as "absent today": history 30 days back is outside the window
  addKw('kw old'); rank('kw old', 'B0AAAAAAA2', '2026-08-01', 2); swept('kw old', '2026-09-25')

  runRulesEngine()
  const got = Object.fromEntries(rankAlerts().map((a) => [a.scope_id, a.message]))
  assert.deepEqual(Object.keys(got).sort(), ['kw dropped', 'kw fell', 'kw hero'])
  assert.match(got['kw dropped'], /no longer appears in the top results.*best position in the last 2 weeks was #3/)
  assert.match(got['kw fell'], /now ranked #12/)
})

test('Command tiles never add estimated days to real days, and do not claim a week-over-week change across them', async () => {
  const ins = sqlite.prepare("INSERT INTO fact_listing_daily (asin, date, sessions, page_views, buy_box_pct, units_ordered, ordered_product_sales, data_quality) VALUES ('B0AAAAAAA1', ?, ?, ?, ?, ?, ?, ?)")
  ins.run('2026-09-22', 10, 12, 100, 1, 100, 'observed')
  ins.run('2026-09-23', 10, 12, 100, 1, 100, 'observed')
  ins.run('2026-09-24', 10, 12, 50, 1, 100, 'observed')
  ins.run('2026-09-21', 40, 55, 99, 3, 2100, 'estimate')      // an estimate inside the same 7-day window
  ins.run('2026-09-14', 8, 10, 99, 1, 140, 'estimate')        // previous week: estimates only

  const v: any = await (await fetch(base + '/v1/dashboard/command')).json()
  const t = (label: string) => v.tiles.find((x: any) => x.label === label)
  assert.equal(t('Sales').value, 300)                         // 100 x 3 real days, not 2,400
  assert.equal(t('Sales').data_quality, 'observed')
  assert.equal(t('Sales').wow_change, null)                   // real vs estimate is not like-for-like
  assert.equal(t('Units').value, 3)
  assert.ok(Math.abs(t('Buy Box %').value - 0.833) < 0.005)   // page-view weighted over the real days only: (12*100+12*100+12*50)/36
})

test('estimate-only windows are still shown, labelled estimate', async () => {
  sqlite.prepare("DELETE FROM fact_listing_daily WHERE data_quality = 'observed'").run()
  const v: any = await (await fetch(base + '/v1/dashboard/command')).json()
  const sales = v.tiles.find((x: any) => x.label === 'Sales')
  assert.equal(sales.data_quality, 'estimate')
  assert.equal(sales.value, 2100)
})

test('Buy Box seller: a storefront reading that shows another seller on our listing raises a red alert', () => {
  const snap = sqlite.prepare("INSERT INTO fact_price_snapshot (asin, captured_at, price, buy_box_seller, data_quality) VALUES (?, ?, 200, ?, 'observed')")
  for (const asin of ['B0AAAAAAA1', 'B0AAAAAAA2', 'B0AAAAAAA3']) snap.run(asin, '2026-09-25T10:00:00Z', 'Backero')
  snap.run('B0AAAAAAA4', '2026-09-25T10:00:00Z', 'Shady Traders')
  runRulesEngine()
  const rows = sqlite.prepare("SELECT scope_id, message FROM alerts WHERE rule_id = 'buy_box_seller_guard' AND status = 'open'").all() as any[]
  assert.deepEqual(rows.map((r) => r.scope_id), ['B0AAAAAAA4'])
  assert.match(rows[0].message, /"Shady Traders".*not Backero/)
  // the seller comes back to us on the next reading -> the alert closes
  snap.run('B0AAAAAAA4', '2026-09-25T16:00:00Z', 'Backero')
  runRulesEngine()
  assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM alerts WHERE rule_id = 'buy_box_seller_guard' AND status = 'open'").get() as any).n, 0)
})

test('unit economics: reference breakeven formula, real fee wins, nothing guessed without a COGS', async () => {
  const { unitEconomics } = await import('../src/metrics.js')
  // (price x 0.82 - 65 - COGS) / price at price 200, COGS 40  ->  (164 - 65 - 40) / 200 = 29.5%
  const est = unitEconomics(200, null, 40)!
  assert.equal(est.fee_source, 'estimate')
  assert.ok(Math.abs(est.breakeven_acos! - 0.295) < 1e-9)
  // a real FBA fee already covers fulfilment: no extra Rs 65
  const real = unitEconomics(152, 133.34, 40)!
  assert.equal(real.shipping, 0)
  assert.ok(Math.abs(real.profit_before_ads! - (152 - 133.34 - 40)) < 1e-9)
  // no COGS: profit and breakeven stay empty
  const none = unitEconomics(200, null, null)!
  assert.equal(none.profit_before_ads, null)
  assert.equal(none.breakeven_acos, null)
  assert.equal(unitEconomics(null, null, 40), null)
})

after(() => {
  server.close()
  try { sqlite.close(); fs.rmSync(dir, { recursive: true, force: true }) } catch { /* Windows may still hold the file; it is a temp dir */ }
})
