import { sqlite } from '../db/client.js'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Single source of truth for the cross-platform pages. Every figure comes from what a platform itself reports
// (its panel / seller hub / business report). Where a platform does not report a figure, it is null - never
// guessed - and the *_basis strings say exactly what each number is measured on.

export interface PlatformMetrics {
  marketplace: string
  impressions: number
  clicks: number
  orders: number
  revenue: number
  ctr_pct: number | null
  cvr_pct: number | null
  ctr_basis: string
  cvr_basis: string
  traffic_basis: string
  aov: number
  rating: number
  return_rate: number
  products: number | null
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
// The live server's folders are listed first; on the dev PC they don't exist so the repo copies are used.
const PLATFORM_DB_PATHS: Record<string, string[]> = {
  meesho: ['/opt/platforms/project/data/saas.db', path.join(REPO_ROOT, 'Meesho/project/data/saas.db')],
  snapdeal: ['/opt/platforms/snapdeal_saas/data/sdpulse.db', path.join(REPO_ROOT, 'Snapdeal/snapdeal_saas/data/sdpulse.db')],
  flipkart: ['/opt/platforms/fkpulse/fk_pulse.db', path.join(REPO_ROOT, 'flipkart/fkpulse/fk_pulse.db')],
}

function openPlatformDb(marketplace: string): DatabaseSync | null {
  const found = (PLATFORM_DB_PATHS[marketplace] ?? []).find((f) => fs.existsSync(f))
  return found ? new DatabaseSync(found, { readOnly: true }) : null
}

function latestPanel(db: DatabaseSync, table: string, area: string): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT key, value FROM ${table} WHERE area = ? AND value IS NOT NULL
       AND captured_at = (SELECT MAX(captured_at) FROM ${table} WHERE area = ?)`
    )
    .all(area, area) as Array<{ key: string; value: number }>
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]))
}

const pct = (num: number, den: number, digits = 2): number | null => (den > 0 ? +((num * 100) / den).toFixed(digits) : null)

function empty(marketplace: string): PlatformMetrics {
  return {
    marketplace, impressions: 0, clicks: 0, orders: 0, revenue: 0, ctr_pct: null, cvr_pct: null,
    ctr_basis: 'Not available', cvr_basis: 'Not available', traffic_basis: 'No data yet', aov: 0, rating: 0, return_rate: 0, products: null,
  }
}

/** One Amazon day (or the 30 days up to today when `date` is omitted) from the Seller Central Business Report. */
export function amazonMetrics(date?: string): PlatformMetrics {
  const m = empty('amazon_in')
  const where = date ? 'date = ?' : "date >= date('now', '-30 days')"
  const d = sqlite
    .prepare(
      `SELECT SUM(sessions) AS sessions, SUM(page_views) AS page_views, SUM(units_ordered) AS units,
              SUM(ordered_product_sales) AS revenue
       FROM fact_listing_daily WHERE ${where}`
    )
    .get(...(date ? [date] : [])) as any
  if (d && d.sessions != null) {
    m.impressions = d.sessions || 0
    m.orders = d.units || 0
    m.revenue = d.revenue || 0
    m.aov = m.orders ? Math.round(m.revenue / m.orders) : 0
    m.cvr_pct = pct(d.units || 0, d.sessions || 0)
    m.cvr_basis = 'Units ordered ÷ sessions (Amazon Business Report)'
    m.traffic_basis = 'Sessions (Amazon does not report organic impressions)'
  }
  // Amazon only reports click-through for Sponsored ads; use the latest Ads console summary when one exists.
  if (!date) {
    const ads = sqlite.prepare('SELECT impressions, clicks, range_label FROM fact_ads_summary ORDER BY id DESC LIMIT 1').get() as any
    if (ads && ads.impressions > 0) {
      m.ctr_pct = pct(ads.clicks || 0, ads.impressions)
      m.ctr_basis = `Amazon Ads only (${ads.range_label}: ${ads.impressions} impressions, ${ads.clicks || 0} clicks)`
      m.clicks = ads.clicks || 0
    } else {
      m.ctr_basis = 'Not available (no ads data; Amazon gives no organic CTR)'
    }
  } else {
    m.ctr_basis = 'Not available (Amazon gives no organic CTR)'
  }
  return m
}

export function getPlatformMetrics(marketplace: string): PlatformMetrics {
  if (marketplace === 'amazon_in') return amazonMetrics()
  const m = empty(marketplace)
  const db = openPlatformDb(marketplace)
  if (!db) return m
  try {
    if (marketplace === 'meesho') {
      // Account totals exactly as Meesho's Business Dashboard headline shows them (Total Views / Clicks / Orders /
      // Conversion Rate / Total Sales). The per-product table is refreshed separately and does not add up to them.
      const head = latestPanel(db, 'panel_metrics', 'business_overview')
      const prod = db
        .prepare(
          `SELECT AVG(rating) AS rating, COUNT(*) AS n FROM panel_products
           WHERE captured_at = (SELECT MAX(captured_at) FROM panel_products)`
        )
        .get() as any
      if (head.views != null) {
        m.impressions = head.views
        m.clicks = head.clicks || 0
        m.orders = head.orders || 0
        m.revenue = head.sales || 0
        m.aov = m.orders ? Math.round(m.revenue / m.orders) : 0
        m.rating = prod?.rating || 0
        m.products = prod?.n ?? null
        m.ctr_pct = pct(m.clicks, m.impressions)
        m.cvr_pct = head.conversion_pct ?? null
        m.ctr_basis = 'Total clicks ÷ total views (Meesho Business Dashboard, calculated here)'
        m.cvr_basis = 'Conversion rate as reported by Meesho (Business Dashboard; Meesho can show more than 100%)'
        m.traffic_basis = 'Total views (Meesho Business Dashboard, selected period)'
      }
    } else if (marketplace === 'snapdeal') {
      const dash = latestPanel(db, 'panel_metrics', 'dashboard')
      const ads = latestPanel(db, 'panel_metrics', 'ads')
      m.orders = dash.orders_booked || 0
      m.revenue = dash.sales_completed || 0
      m.rating = dash.avg_seller_rating || 0
      m.return_rate = dash.orders_booked ? (dash.orders_returned || 0) / dash.orders_booked : 0
      m.products = (db.prepare("SELECT COUNT(*) AS n FROM listings WHERE status = 'live'").get() as any)?.n ?? null
      m.aov = m.orders ? Math.round(m.revenue / m.orders) : 0
      if (ads.impressions > 0) {
        m.impressions = ads.impressions
        m.clicks = ads.clicks || 0
        m.ctr_pct = pct(m.clicks, m.impressions)
        m.cvr_pct = pct(ads.conversions || 0, m.clicks)
        m.ctr_basis = 'Snapdeal Ads only: ad clicks ÷ ad impressions (Sponsored Products, last 30 days)'
        m.cvr_basis = 'Snapdeal Ads only: ad orders ÷ ad clicks (last 30 days)'
        m.traffic_basis = 'Ad impressions (Snapdeal reports no total traffic)'
      } else {
        m.ctr_basis = m.cvr_basis = 'Not available (Snapdeal reports no total traffic)'
      }
    } else if (marketplace === 'flipkart') {
      const biz = latestPanel(db, 'hub_metrics', 'business_health')
      const ads = latestPanel(db, 'hub_metrics', 'ads')
      let rating = 0
      try {
        rating = ((db.prepare('SELECT AVG(rating_avg) AS r FROM listings WHERE rating_avg IS NOT NULL').get() as any)?.r) || 0
      } catch {
        rating = 0
      }
      m.impressions = biz.impressions_7d || 0
      m.orders = biz.units_7d || 0
      m.revenue = biz.sales_7d || 0
      m.aov = m.orders ? Math.round(m.revenue / m.orders) : 0
      m.rating = rating
      m.return_rate = (biz.buyer_returns_pct || 0) / 100
      m.products = (db.prepare('SELECT COUNT(*) AS n FROM listings').get() as any)?.n ?? null
      m.traffic_basis = 'Impressions, last 7 days (Flipkart Seller Hub)'
      if (biz.conversion_7d_pct != null) {
        m.cvr_pct = biz.conversion_7d_pct
        m.cvr_basis = 'Seller Hub conversion, last 7 days'
      } else {
        m.cvr_basis = 'Not available'
      }
      if (ads.views > 0) {
        m.ctr_pct = pct(ads.clicks || 0, ads.views)
        m.clicks = ads.clicks || 0
        m.ctr_basis = `Flipkart Ads only: ad clicks ÷ ad views (${ads.clicks || 0} / ${ads.views})`
      } else {
        m.ctr_basis = 'Not available (Flipkart gives no organic CTR)'
      }
    }
  } finally {
    db.close()
  }
  return m
}
