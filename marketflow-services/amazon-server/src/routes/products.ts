import { Router } from 'express'
import { z } from 'zod'
import { sqlite, withTransaction } from '../db/client.js'
import { cogsStatus, COGS_STALE_DAYS } from '../lib/cogs.js'
import { runRulesEngine } from '../rules/engine.js'
import { ESTIMATED_FEE_RATE, ESTIMATED_SHIPPING } from '../metrics.js'

const router = Router()

router.get('/v1/products', (_req, res) => {
  const rows = sqlite
    .prepare('SELECT asin, sku, name, category, price, cogs, cogs_updated_at, is_hero, fulfilment, fee_per_unit FROM dim_product WHERE is_own = 1 ORDER BY is_hero DESC, name')
    .all() as { asin: string; sku: string; name: string; category: string; price: number | null; cogs: number | null; cogs_updated_at: string | null; is_hero: number; fulfilment: string | null; fee_per_unit: number | null }[]
  res.json({
    stale_after_days: COGS_STALE_DAYS,
    fee_rate: ESTIMATED_FEE_RATE,
    shipping: ESTIMATED_SHIPPING,
    products: rows.map((r) => ({ ...r, cogs_status: cogsStatus(r.cogs, r.cogs_updated_at).status, cogs_age_days: cogsStatus(r.cogs, r.cogs_updated_at).age_days })),
  })
})

const cogsValue = z.number().positive().max(1_000_000)
const setCogs = sqlite.prepare('UPDATE dim_product SET cogs = ?, cogs_updated_at = ? WHERE asin = ? AND is_own = 1')

// One SKU
router.put('/v1/products/:asin/cogs', (req, res) => {
  const parsed = z.object({ cogs: cogsValue }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'cogs must be a positive number (₹ per unit)' })
  const r = setCogs.run(parsed.data.cogs, new Date().toISOString(), req.params.asin)
  if (r.changes === 0) return res.status(404).json({ error: 'own product not found' })
  runRulesEngine() // breakeven ACOS / margin depend on it
  res.json({ ok: true })
})

// Many at once (the "Save all" button / a pasted sheet). Everything or nothing.
router.post('/v1/products/cogs', (req, res) => {
  const parsed = z.object({ items: z.array(z.object({ asin: z.string(), cogs: cogsValue })).min(1).max(500) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'items must be [{asin, cogs}] with positive cogs' })
  const now = new Date().toISOString()
  const missing: string[] = []
  withTransaction(() => {
    for (const it of parsed.data.items) {
      if (setCogs.run(it.cogs, now, it.asin).changes === 0) missing.push(it.asin)
    }
    if (missing.length) throw new Error('unknown asin')
  })
  runRulesEngine()
  res.json({ ok: true, updated: parsed.data.items.length })
})

// Get products with full COGS breakdown
router.get('/v1/products/breakdown/:marketplace', (req, res) => {
  try {
    const marketplace = req.params.marketplace || 'amazon_in'

    const products = sqlite
      .prepare(`
        SELECT
          id,
          sku,
          name,
          sellingPrice,
          productCost,
          procurementCost,
          packagingCost,
          fulfillmentCost,
          shippingCost,
          platformFees,
          returnsLoss,
          quantity,
          marketplace
        FROM products
        WHERE marketplace = ?
        ORDER BY sku
      `)
      .all(marketplace) as any[]

    res.json({
      marketplace,
      total: products.length,
      products: products || [],
    })
  } catch (err) {
    console.error('[products-breakdown] Error:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
