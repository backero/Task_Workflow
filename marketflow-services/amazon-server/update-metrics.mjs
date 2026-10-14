import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const centralDbPath = path.join(__dirname, 'data', 'mcc.db');

const realData = {
  meesho: {
    snapshot_date: '2026-09-30',
    impressions: 6838,
    clicks: 137,
    orders: 5,
    revenue: 723,
    ctr_pct: 2.00,
    cvr_pct: 3.65,
    avg_order_value: 144.6,
    listings: 27,
    avg_rating: 4.37,
    margin_pct: 15,
    open_alerts: 0,
    critical_alerts: 0
  },
  snapdeal: {
    snapshot_date: '2026-09-30',
    impressions: 12107,
    clicks: 1834,
    orders: 76,
    revenue: 1800,
    ctr_pct: 15.14,
    cvr_pct: 4.14,
    avg_order_value: 23.68,
    listings: 45,
    avg_rating: 4.0,
    margin_pct: 12,
    open_alerts: 0,
    critical_alerts: 0
  }
};

try {
  const db = new DatabaseSync(centralDbPath);

  console.log('📊 Updating metrics_platform_comparison table...');

  const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='metrics_platform_comparison'`).get();

  if (!tableExists) {
    console.log('Creating metrics_platform_comparison table...');
    db.exec(`
      CREATE TABLE metrics_platform_comparison (
        id INTEGER PRIMARY KEY,
        marketplace TEXT,
        snapshot_date TEXT,
        impressions REAL,
        clicks REAL,
        orders REAL,
        revenue REAL,
        ctr_pct REAL,
        cvr_pct REAL,
        avg_order_value REAL,
        margin_pct REAL,
        net_profit REAL,
        open_alerts INTEGER,
        critical_alerts INTEGER,
        avg_rating REAL,
        return_rate REAL,
        wow_change_pct REAL,
        mom_change_pct REAL
      )
    `);
  }

  for (const [marketplace, data] of Object.entries(realData)) {
    db.prepare(`
      INSERT OR REPLACE INTO metrics_platform_comparison
      (marketplace, snapshot_date, impressions, clicks, orders, revenue, ctr_pct, cvr_pct,
       avg_order_value, margin_pct, open_alerts, critical_alerts, avg_rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      marketplace,
      data.snapshot_date,
      data.impressions,
      data.clicks,
      data.orders,
      data.revenue,
      data.ctr_pct,
      data.cvr_pct,
      data.avg_order_value,
      data.margin_pct,
      data.open_alerts,
      data.critical_alerts,
      data.avg_rating
    );

    console.log(`  ✅ ${marketplace}: ${data.orders} orders, ₹${data.revenue} revenue`);
  }

  db.close();
  console.log('');
  console.log('✅ Metrics updated! Refresh browser to see changes.');
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
