import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const centralDbPath = path.join(__dirname, 'data', 'mcc.db');

// Each platform's own robot exposes a small read-only REST API over its real local database
// (see each project's api.ts / api.py). Pulling from these HTTP endpoints - instead of guessing
// with random numbers - is what makes this bridge honest: every field here is traceable to a real
// row the platform's own robot scraped.
const ROBOT_APIS = {
  meesho: 'http://127.0.0.1:8000/api/overview',
  snapdeal: 'http://127.0.0.1:8300/api/overview',
  flipkart: 'http://127.0.0.1:8600/api/overview',
};

async function pullMeeshoData() {
  const res = await fetch(ROBOT_APIS.meesho, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const k = d.kpis || {};
  // Revenue and clicks are not exposed by Meesho's Seller Panel scrape - reported as 0, not guessed.
  return {
    kpis: {
      impressions_7d: k.impressions_7d ?? 0,
      clicks_7d: 0,
      orders_7d: k.orders_7d ?? 0,
      revenue_7d: 0,
      listings: k.listings ?? 0,
      avg_rating: k.avg_rating ?? null,
    },
  };
}

async function pullFlipkartData() {
  const res = await fetch(ROBOT_APIS.flipkart, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const bh = d.account_metrics?.business_health || {};
  return {
    account_metrics: {
      business_health: {
        impressions_7d: bh.impressions_7d ?? 0,
        units_7d: bh.units_7d ?? 0,
        conversion_7d_pct: bh.conversion_7d_pct ?? 0,
        sales_7d: bh.sales_7d ?? 0,
      },
    },
    listings: d.listings ?? 0,
  };
}

async function pullSnapdealData() {
  const res = await fetch(ROBOT_APIS.snapdeal, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const w = d.week || {};
  // Snapdeal's own robot has not captured order-level traffic yet for most SKUs - an honest 0,
  // not a filled-in guess. See data_quality on the resulting trend row.
  return {
    kpis: {
      impressions: w.impressions ?? 0,
      clicks: w.clicks ?? 0,
      orders: w.orders ?? 0,
      revenue: w.revenue ?? 0,
      listings: d.listings ?? 0,
      avg_rating: null,
    },
  };
}

function pushToCentral(marketplace, payload) {
  try {
    const db = new DatabaseSync(centralDbPath);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO raw_ingest (received_at, source, marketplace, payload_type, captured_at, idempotency_key, record_count, body_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      now, `${marketplace}_robot`, marketplace, 'overview', now,
      `${marketplace}-${Date.now()}`, 1, JSON.stringify(payload)
    );

    db.close();
    console.log(`  ✅ ${marketplace}`);
    return true;
  } catch (err) {
    console.error(`  ❌ ${marketplace} (write): ${err.message}`);
    return false;
  }
}

async function syncOne(marketplace, puller) {
  try {
    const data = await puller();
    pushToCentral(marketplace, data);
  } catch (err) {
    console.error(`  ⚠️  ${marketplace} (fetch): ${err.message} — is its robot app running?`);
  }
}

async function syncAllRobots() {
  console.log(`[${new Date().toLocaleTimeString()}] Syncing from each platform's real robot API...`);
  await syncOne('meesho', pullMeeshoData);
  await syncOne('flipkart', pullFlipkartData);
  await syncOne('snapdeal', pullSnapdealData);
  console.log('');
}

async function runBridge() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🌉 ROBOT DATA BRIDGE - REAL DATA ONLY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Pulls from each platform\'s own live API (Meesho:8000, Snapdeal:8300, Flipkart:8600).');
  console.log('No random/fabricated numbers - a platform that is unreachable is skipped and logged, not faked.');
  console.log('');

  await syncAllRobots();
  setInterval(syncAllRobots, 15 * 60 * 1000);

  console.log('✅ Bridge running. Syncs every 15 minutes.');
  console.log('');
}

runBridge().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
