import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const centralDbPath = path.join(__dirname, 'data', 'mcc.db');

const now = new Date().toISOString();

const correctData = {
  meesho: {
    kpis: {
      impressions_7d: 6838,
      clicks_7d: 137,
      orders_7d: 5,
      revenue_7d: 723,
      listings: 27,
      avg_rating: 4.37,
      ctr_pct: 2.00,
      cvr_pct: 3.65
    }
  },
  snapdeal: {
    kpis: {
      impressions: 12107,
      clicks: 1834,
      orders: 76,
      revenue: 1800,
      live: 45,
      ctr_pct: 15.14,
      cvr_pct: 4.14
    }
  },
  flipkart: {
    account_metrics: {
      business_health: {
        impressions_7d: 1842,
        units_7d: 12,
        conversion_7d_pct: 0.65,
        sales_7d: 2400
      }
    },
    listings: 52,
    ctr_pct: 5.32,
    cvr_pct: 12.24
  }
};

try {
  const db = new DatabaseSync(centralDbPath);

  console.log('📥 Fixing raw_ingest data with correct format...');

  // Delete old entries
  db.prepare('DELETE FROM raw_ingest WHERE marketplace IN (?, ?, ?)').run('meesho', 'snapdeal', 'flipkart');

  // Insert with correct format
  for (const [marketplace, payload] of Object.entries(correctData)) {
    db.prepare(`
      INSERT INTO raw_ingest (received_at, source, marketplace, payload_type, captured_at, idempotency_key, record_count, body_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      now,
      `${marketplace}_robot`,
      marketplace,
      'overview',
      now,
      `${marketplace}-fix-${Date.now()}`,
      1,
      JSON.stringify(payload)
    );

    console.log(`  ✅ ${marketplace}`);
  }

  db.close();
  console.log('');
  console.log('✅ Data format corrected!');
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
