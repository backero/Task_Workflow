import { Router } from 'express'
import { openPlatformDb } from '../processors/platform-metrics.js'

const router = Router()

export type PlatformListing = {
  sku: string
  name: string | null
  price: number | null
  stock: number | null
  status: string | null
  rating: number | null
  quality_score: number | null
}

/**
 * Core inventory/listings for Meesho, Snapdeal, Flipkart - read directly from each
 * platform's own synced SQLite file (same openPlatformDb pattern as platform-metrics.ts
 * and platform-alerts.ts). These platforms have no HTTP API running on this server's
 * host; this is the only way their listing data reaches this backend (and, via the
 * /v1/* proxy, the Marketflow SaaS integration).
 */
function readListings(marketplace: 'meesho' | 'snapdeal' | 'flipkart'): PlatformListing[] {
  const db = openPlatformDb(marketplace)
  if (!db) return []
  try {
    let rows: any[]
    if (marketplace === 'meesho') {
      rows = db.prepare(`
        SELECT l.catalog_id AS sku, l.name AS name,
               COALESCE(s.price, l.price) AS price,
               s.stock AS stock,
               l.status AS status,
               s.rating AS rating,
               s.quality_score AS quality_score
        FROM listings l
        LEFT JOIN (
          SELECT listing_id, price, stock, rating, quality_score,
                 ROW_NUMBER() OVER (PARTITION BY listing_id ORDER BY id DESC) AS rn
          FROM snapshots
        ) s ON s.listing_id = l.id AND s.rn = 1
        ORDER BY l.id
      `).all() as any[]
    } else if (marketplace === 'snapdeal') {
      rows = db.prepare(`
        SELECT sku AS sku, title AS name, price AS price, stock AS stock,
               status AS status, rating AS rating, NULL AS quality_score
        FROM listings
        ORDER BY sku
      `).all() as any[]
    } else {
      rows = db.prepare(`
        SELECT fsn AS sku, title AS name, price AS price, stock AS stock,
               status AS status, rating_avg AS rating, NULL AS quality_score
        FROM listings
        ORDER BY fsn
      `).all() as any[]
    }
    return rows.map((r) => ({
      sku: String(r.sku),
      name: r.name ?? null,
      price: r.price ?? null,
      stock: r.stock ?? null,
      status: r.status ?? null,
      rating: r.rating ?? null,
      quality_score: r.quality_score ?? null,
    }))
  } finally {
    db.close()
  }
}

router.get('/v1/platform/:marketplace/listings', (req, res) => {
  const marketplace = req.params.marketplace
  if (marketplace !== 'meesho' && marketplace !== 'snapdeal' && marketplace !== 'flipkart') {
    return res.status(400).json({ error: 'marketplace must be one of: meesho, snapdeal, flipkart' })
  }
  try {
    const listings = readListings(marketplace)
    res.json({ marketplace, count: listings.length, listings })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
