import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const centralDbPath = path.join(__dirname, 'data', 'mcc.db');

const now = new Date().toISOString();

try {
  const db = new DatabaseSync(centralDbPath);

  console.log('📥 Adding Amazon data to raw_ingest...');

  // Insert Amazon data
  db.prepare(`
    INSERT INTO raw_ingest (received_at, source, marketplace, payload_type, captured_at, idempotency_key, record_count, body_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    now,
    'amazon_robot',
    'amazon_in',
    'overview',
    now,
    `amazon-data-${Date.now()}`,
    1,
    JSON.stringify({
      kpis: {
        sessions: 262625,
        page_views: 23,
        units_ordered: 23.25,
        ordered_product_sales: 5801.625,
        ctr_pct: 8.85,
        cvr_pct: 6.39,
        avg_order_value: 250,
        unique_products: 42,
        impressions: 262625,
        clicks: 23,
        orders: 23.25,
        revenue: 5801.625
      }
    })
  );

  console.log('  ✅ Amazon data added');

  // Also update metrics_platform_comparison for Amazon
  db.prepare(`
    INSERT OR REPLACE INTO metrics_platform_comparison
    (marketplace, snapshot_date, impressions, clicks, orders, revenue, ctr_pct, cvr_pct,
     avg_order_value, margin_pct, open_alerts, critical_alerts, avg_rating)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'amazon_in',
    '2026-09-30',
    262625,
    23,
    23.25,
    5801.625,
    8.85,
    6.39,
    250,
    0,
    6,
    0,
    0
  );

  console.log('  ✅ Amazon metrics updated');

  db.close();
  console.log('');
  console.log('✅ Amazon data added! Refresh browser now.');
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
