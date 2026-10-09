#!/usr/bin/env node
// Enhanced demo data generator for Meesho robot
// Generates realistic snapshots simulating live Meesho seller data

import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, 'data/saas.db'))

const CATEGORIES = ['Cotton Kurta', 'Women Saree', 'Men Casual Shoes', 'Ethnic Wear', 'Accessories']
const SKUS = ['SKU001', 'SKU002', 'SKU003', 'SKU004', 'SKU005']

function generateSnapshot() {
  const now = new Date()
  const listings = []

  for (let i = 0; i < 25; i++) {
    const baseImpressions = Math.floor(Math.random() * 5000) + 1000
    const clicks = Math.floor(baseImpressions * (Math.random() * 0.03 + 0.005))
    const orders = Math.floor(clicks * (Math.random() * 0.15 + 0.02))

    listings.push({
      listing_id: SKUS[i % SKUS.length],
      impressions: baseImpressions,
      views: Math.floor(baseImpressions * 0.8),
      clicks: clicks,
      orders: orders,
      returns: Math.floor(orders * 0.05),
      rto: Math.floor(orders * 0.08),
      rating: (Math.random() * 1.5 + 3.5).toFixed(1),
      quality_score: Math.floor(Math.random() * 30) + 75,
      stock: Math.floor(Math.random() * 500) + 50,
      price: Math.floor(Math.random() * 2000) + 300,
      category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
      status: 'active',
      ts: now.toISOString()
    })
  }

  return listings
}

function insertSnapshots() {
  const data = generateSnapshot()

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO snapshots (
      listing_id, ts, impressions, views, clicks, orders, returns, rto,
      rating, quality_score, stock, price, category, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const transaction = db.transaction((listings) => {
    for (const item of listings) {
      stmt.run(
        item.listing_id, item.ts, item.impressions, item.views, item.clicks,
        item.orders, item.returns, item.rto, item.rating, item.quality_score,
        item.stock, item.price, item.category, item.status
      )
    }
  })

  transaction(data)
  console.log(`✅ Generated ${data.length} Meesho demo snapshots`)
}

try {
  insertSnapshots()
} catch (e) {
  console.log('[Demo] Table might not exist yet - will create on first robot run')
  console.log('[Demo] Or Meesho is in browser-login mode - will use real data')
}

db.close()
