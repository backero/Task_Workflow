import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'mcc.db');

function connectDB() {
  const db = new DatabaseSync(dbPath);
  return db;
}

// Realistic data ranges for each platform - CORRECT JSON structures
const platformConfigs = {
  meesho: {
    source: 'meesho_robot',
    buildMetrics: () => ({
      kpis: {
        impressions_7d: Math.floor(1200 + Math.random() * 400),
        clicks_7d: Math.floor(85 + Math.random() * 30),
        orders_7d: Math.floor(16 + Math.random() * 8),
        revenue_7d: Math.floor(2300 + Math.random() * 800),
        listings: 45,
        avg_rating: 4.1 + Math.random() * 0.3
      }
    })
  },
  snapdeal: {
    source: 'snapdeal_robot',
    buildMetrics: () => ({
      kpis: {
        impressions: Math.floor(900 + Math.random() * 350),
        clicks: Math.floor(65 + Math.random() * 25),
        orders: Math.floor(13 + Math.random() * 7),
        revenue: Math.floor(1750 + Math.random() * 700),
        listings: 38,
        avg_rating: 4.0 + Math.random() * 0.25
      }
    })
  },
  flipkart: {
    source: 'flipkart_robot',
    buildMetrics: () => ({
      account_metrics: {
        business_health: {
          impressions_7d: Math.floor(1450 + Math.random() * 500),
          units_7d: Math.floor(20 + Math.random() * 10),
          conversion_7d_pct: 1.2 + Math.random() * 0.6,
          sales_7d: Math.floor(2900 + Math.random() * 1000)
        }
      },
      listings: 52
    })
  }
};

function insertPlatformData(marketplace) {
  try {
    const db = connectDB();
    const config = platformConfigs[marketplace];
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO raw_ingest (received_at, source, marketplace, payload_type, captured_at, idempotency_key, record_count, body_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const payload = config.buildMetrics();

    stmt.run(
      now,
      config.source,
      marketplace,
      'overview',
      now,
      `${marketplace}-${Date.now()}`,
      1,
      JSON.stringify(payload)
    );

    console.log(`✅ ${marketplace.padEnd(10)} - Data inserted at ${new Date().toLocaleTimeString()}`);
    db.close();
    return true;
  } catch (err) {
    console.error(`❌ ${marketplace}: ${err.message}`);
    return false;
  }
}

async function runSimulation() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 PLATFORM DATA SIMULATOR v2 (Fixed Flipkart)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📊 Generating realistic data for all platforms`);
  console.log(`⏰ Schedule: Now + Every 4 hours`);
  console.log(`📍 Database: ${dbPath}`);
  console.log('');

  async function sendAllPlatforms() {
    console.log(`[${new Date().toLocaleString()}] Updating all platforms...`);
    for (const marketplace of ['meesho', 'snapdeal', 'flipkart']) {
      insertPlatformData(marketplace);
    }
    console.log('');
  }

  // Send immediately
  await sendAllPlatforms();

  // Then every 4 hours
  const fourHoursMs = 4 * 60 * 60 * 1000;
  setInterval(sendAllPlatforms, fourHoursMs);

  console.log(`✅ Simulator active. Next update in 4 hours.`);
  console.log(`📌 This window must stay open. Press Ctrl+C to stop.\n`);
}

runSimulation().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
