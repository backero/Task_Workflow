import { Router } from 'express'
import { z } from 'zod'
import { sqlite } from '../db/client.js'

// What Robo watches on the public storefront: keywords (rank + share of search) and rival ASINs
// (price, deal, rating, reviews). Until now these could only be seeded by hand in the database, which
// is why the founder's "20–50 keywords per hero SKU, 10–30 competitors" was out of reach.
const router = Router()

router.get('/v1/tracking', (_req, res) => {
  res.json({
    keywords: sqlite.prepare('SELECT id, keyword, is_hero_target FROM dim_keyword ORDER BY is_hero_target DESC, keyword').all(),
    competitors: sqlite.prepare(`
      SELECT c.asin, c.name, c.watches_asin, o.name AS watches_name
      FROM dim_product c LEFT JOIN dim_product o ON o.asin = c.watches_asin
      WHERE c.is_own = 0 ORDER BY o.name, c.name
    `).all(),
    own_products: sqlite.prepare('SELECT asin, name FROM dim_product WHERE is_own = 1 ORDER BY is_hero DESC, name').all(),
  })
})

const keywordBody = z.object({ keyword: z.string().trim().min(2).max(80), is_hero_target: z.boolean().optional() })

router.post('/v1/tracking/keywords', (req, res) => {
  const parsed = keywordBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'keyword must be 2–80 characters' })
  // Amazon search is case-insensitive; store one canonical form so "Hair Oil" and "hair oil" aren't two rows.
  const keyword = parsed.data.keyword.toLowerCase().replace(/\s+/g, ' ')
  const r = sqlite.prepare('INSERT OR IGNORE INTO dim_keyword (keyword, is_hero_target) VALUES (?, ?)').run(keyword, parsed.data.is_hero_target ? 1 : 0)
  res.json({ ok: true, added: r.changes > 0, keyword })
})

router.put('/v1/tracking/keywords/:id', (req, res) => {
  const parsed = z.object({ is_hero_target: z.boolean() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'is_hero_target must be true or false' })
  const r = sqlite.prepare('UPDATE dim_keyword SET is_hero_target = ? WHERE id = ?').run(parsed.data.is_hero_target ? 1 : 0, Number(req.params.id))
  if (r.changes === 0) return res.status(404).json({ error: 'keyword not found' })
  res.json({ ok: true })
})

router.delete('/v1/tracking/keywords/:id', (req, res) => {
  const r = sqlite.prepare('DELETE FROM dim_keyword WHERE id = ?').run(Number(req.params.id))
  if (r.changes === 0) return res.status(404).json({ error: 'keyword not found' })
  res.json({ ok: true }) // history in fact_keyword_rank_daily / fact_search_share is kept
})

const competitorBody = z.object({
  asin: z.string().trim().toUpperCase().regex(/^B0[A-Z0-9]{8}$/, 'an ASIN looks like B0XXXXXXXX'),
  name: z.string().trim().max(120).optional(),
  watches_asin: z.string().trim(),
})

router.post('/v1/tracking/competitors', (req, res) => {
  const parsed = competitorBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid competitor' })
  const { asin, name, watches_asin } = parsed.data
  const own = sqlite.prepare('SELECT asin, category FROM dim_product WHERE asin = ? AND is_own = 1').get(watches_asin) as { asin: string; category: string } | undefined
  if (!own) return res.status(400).json({ error: 'watches_asin must be one of your own products' })
  const existing = sqlite.prepare('SELECT is_own FROM dim_product WHERE asin = ?').get(asin) as { is_own: number } | undefined
  if (existing?.is_own === 1) return res.status(400).json({ error: 'that ASIN is one of your own products' })
  if (existing) {
    sqlite.prepare('UPDATE dim_product SET watches_asin = ? WHERE asin = ?').run(watches_asin, asin)
  } else {
    // The real title arrives with Robo's first look at the page (until then the ASIN stands in for the name).
    sqlite.prepare(`INSERT INTO dim_product (asin, sku, name, category, marketplace_code, price, is_hero, is_own, watches_asin)
                    VALUES (?, ?, ?, ?, 'amazon_in', NULL, 0, 0, ?)`).run(asin, asin, name || asin, own.category, watches_asin)
  }
  res.json({ ok: true, asin })
})

router.delete('/v1/tracking/competitors/:asin', (req, res) => {
  const r = sqlite.prepare('DELETE FROM dim_product WHERE asin = ? AND is_own = 0').run(req.params.asin)
  if (r.changes === 0) return res.status(404).json({ error: 'competitor not found' })
  res.json({ ok: true }) // price / rank history is kept
})

export default router
