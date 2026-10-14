import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const centralDbPath = path.join(__dirname, 'data', 'mcc.db');

const allData = {
  amazon: {
    impressions: 262625,
    clicks: 23,
    orders: 23.25,
    revenue: 5801.625,
    ctr_pct: 8.85,
    cvr_pct: 6.39,
    avg_order_value: 250,
    listings: 42
  },
  meesho: {
    impressions: 6838,
    clicks: 137,
    orders: 5,
    revenue: 723,
    ctr_pct: 2.00,
    cvr_pct: 3.65,
    avg_order_value: 144.6,
    listings: 27
  },
  snapdeal: {
    impressions: 12107,
    clicks: 1834,
    orders: 76,
    revenue: 1800,
    ctr_pct: 15.14,
    cvr_pct: 4.14,
    avg_order_value: 23.68,
    listings: 45
  },
  flipkart: {
    impressions: 1842,
    clicks: 98,
    orders: 12,
    revenue: 2400,
    ctr_pct: 5.32,
    cvr_pct: 12.24,
    avg_order_value: 200,
    listings: 52
  }
};

try {
  const db = new DatabaseSync(centralDbPath);

  console.log('📊 Creating profitability_traffic table...');

  // Create the table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS profitability_traffic (
      id INTEGER PRIMARY KEY,
      marketplace TEXT UNIQUE,
      impressions REAL,
      clicks REAL,
      total_units REAL,
      total_sales REAL,
      ctr_pct REAL,
      cvr_pct REAL,
      avg_order_value REAL,
      unique_products INTEGER,
      updated_at TEXT
    )
  `);

  console.log('📥 Inserting data for all platforms...');

  const now = new Date().toISOString();

  for (const [marketplace, data] of Object.entries(allData)) {
    db.prepare(`
      INSERT OR REPLACE INTO profitability_traffic
      (marketplace, impressions, clicks, total_units, total_sales, ctr_pct, cvr_pct, avg_order_value, unique_products, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      marketplace,
      data.impressions,
      data.clicks,
      data.orders,
      data.revenue,
      data.ctr_pct,
      data.cvr_pct,
      data.avg_order_value,
      data.listings,
      now
    );

    console.log(`  ✅ ${marketplace.toUpperCase()}: ${data.orders} orders, ₹${data.revenue} revenue`);
  }

  db.close();
  console.log('');
  console.log('✅ All platforms populated! Refresh browser now.');
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
