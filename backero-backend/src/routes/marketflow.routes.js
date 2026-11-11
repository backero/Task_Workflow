/**
 * Routes for the "Marketflow" section.
 *
 * amazon (/v1/*): still a live Node service (marketflow-services/amazon-server,
 * unchanged) — forwarded via the allowlisted proxy, same as before.
 *
 * meesho/snapdeal/flipkart (/meesho, /snapdeal, /flipkart): these 3 no longer
 * run HTTP servers at all — python-service/{meesho,snapdeal,flipkart}/run_scheduler.py
 * runs just their scraper/scheduler logic and pushes "overview" data into
 * MongoDB (python-service/mongo_sync.py) on its own schedule. These routes
 * read that collection directly; there is nothing left to proxy to.
 *
 * JWT-only (no orgIsolation): no organizationId concept here, same precedent
 * as socialEngine.routes.js.
 */
const router = require('express').Router();
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { authenticate } = require('../middleware/auth.middleware');
const marketflow = require('../services/marketflow.service');
const MarketflowSnapshot = require('../models/MarketflowSnapshot');
const MarketflowTrendPoint = require('../models/MarketflowTrendPoint');
const { v1Allowlist } = require('../utils/marketflowAllowlist');
const { sendError } = require('../utils/helpers');

router.use(authenticate);

// Last-known-good cache per platform+view. Confirmed root cause: something other than this
// backend's own sync processes (watchdog_sync.py, whose own writes have been verified correct
// on every single cycle) is also upserting the same MarketflowSnapshot documents — almost
// certainly a separate, unauthenticated instance of the same scraper pointed at this shared
// MongoDB — intermittently overwriting good data with an empty/zero snapshot. Can't stop that
// writer from here, so instead: never regress the UI to empty when we've already seen real
// data for that platform in this process's lifetime.
const _lastGoodCache = {};

function _withLastGoodFallback(cacheKey, candidate, isEmpty) {
  if (candidate && !isEmpty(candidate)) {
    _lastGoodCache[cacheKey] = candidate;
    return candidate;
  }
  return _lastGoodCache[cacheKey] || candidate;
}

// Field-level variant for objects like buildAccountSummary's output, where different sub-reads
// (e.g. snapdeal's settlements vs panel) can race independently — one field reading null for a
// moment while its siblings read fine. Falls back per-field (null/undefined only, real 0 is left
// alone) instead of all-or-nothing, so a partial race doesn't show a stale sibling next to a
// wrongly-zeroed field. Fields that are always null by design (e.g. snapdeal's rto_count) just
// stay null on both sides — no behavior change for those.
function _withLastGoodFieldFallback(cacheKey, candidate) {
  if (!candidate) return _lastGoodCache[cacheKey] || candidate;
  const cached = _lastGoodCache[cacheKey] || {};
  const merged = { ...candidate };
  for (const key of Object.keys(candidate)) {
    if (candidate[key] == null && cached[key] != null) merged[key] = cached[key];
  }
  _lastGoodCache[cacheKey] = merged;
  return merged;
}

// _lastGoodCache starts empty on every process restart (deploy, crash, manual restart) — proven
// live: the very first request after a restart, if it happens to land during a platform's known
// raw-data race, has nothing to fall back to yet and passes a real zero straight through, even
// though the scraper's own persisted history has a perfectly good value sitting right there.
// Seeds the unified-dashboard cache for meesho/snapdeal/flipkart from each platform's most recent
// MarketflowTrendPoint (real daily history, not fabricated) so there's always something to fall
// back to from the very first request, not just after the first good live read.
async function seedLastGoodCacheOnStartup() {
  try {
    for (const platform of ['meesho', 'snapdeal', 'flipkart']) {
      const latest = await MarketflowTrendPoint.findOne({ platform }).sort({ date: -1 }).lean();
      if (!latest) continue;
      _lastGoodCache[`unified:${platform}`] = {
        revenue: latest.revenue || 0, orders: latest.orders || 0, impressions: latest.impressions || 0,
        margin_pct: 0, ctr_pct: latest.ctr_pct || 0, cvr_pct: latest.cvr_pct || 0,
      };
    }
  } catch (err) {
    console.error('seedLastGoodCacheOnStartup error:', err.message);
  }
}
seedLastGoodCacheOnStartup();

// Captures one real daily trend point the first time (per platform) each day a non-empty
// normalized value is seen — idempotent via the unique {platform, date} index, so calling
// this on every dashboard load is cheap and safe. This is how /v1/trends/* gets real history
// going forward instead of proxying amazon-server's flat-lined fake numbers for these 3
// platforms (see MarketflowTrendPoint.js for why this collection exists at all).
async function captureTrendPointIfNeeded(platform, normalized) {
  if (!normalized || (!normalized.revenue && !normalized.orders && !normalized.impressions)) return;
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  try {
    await MarketflowTrendPoint.updateOne(
      { platform, date },
      {
        $setOnInsert: {
          platform, date,
          revenue: normalized.revenue || 0,
          orders: normalized.orders || 0,
          impressions: normalized.impressions || 0,
          ctr_pct: normalized.ctr_pct || 0,
          cvr_pct: normalized.cvr_pct || 0,
        },
      },
      { upsert: true },
    );
  } catch (e) {
    console.error('captureTrendPointIfNeeded error:', e.message);
  }
}

// Flattens each scraper's own nested sync shape (python-service/{meesho,snapdeal,flipkart})
// into the {revenue, orders, impressions, margin_pct} shape the unified dashboard expects.
// Only maps fields the scraper actually measured — never fabricates a number it doesn't have.
function normalizeScraperSnapshot(platform, data) {
  if (!data) return null;
  if (platform === 'meesho') {
    const k = data.kpis || {};
    // Home page's today-counters — real, scraped every cycle, previously synced but never
    // read by anything. Passed through as-is (daily_orders/daily_views/pending_orders/etc)
    // rather than reshaped, since only this platform has these exact field names.
    const home = data.account_metrics?.home || null;
    return {
      revenue: k.sales_7d || 0,
      orders: k.orders_7d || 0,
      impressions: k.impressions_7d || 0,
      margin_pct: 0,
      listings: k.listings || 0,
      avg_rating: k.avg_rating || 0,
      ctr_pct: k.impressions_7d ? (k.clicks_7d / k.impressions_7d) * 100 : 0,
      cvr_pct: k.conversion_pct_7d || 0,
      ctr_basis: 'Real: 7-day clicks ÷ impressions',
      cvr_basis: 'Real: Meesho Business Dashboard conversion rate',
      daily: home,
    };
  }
  if (platform === 'snapdeal') {
    const w = data.week || {};
    const p = data.panel || {};
    // week.* comes from a separate per-SKU metrics scraper module that isn't always populated;
    // panel.* is the Seller Panel's own dashboard headline (sales_completed/orders_processed),
    // read by the same scrape that succeeds reliably — prefer it when week.* is empty.
    return {
      revenue: w.revenue || p.sales_completed || 0,
      orders: w.orders || p.orders_processed || 0,
      impressions: w.impressions || 0,
      margin_pct: 0,
      listings: data.listings || 0,
      avg_rating: p.avg_seller_rating || 0,
      ctr_pct: w.impressions ? (w.clicks / w.impressions) * 100 : 0,
      cvr_pct: w.clicks ? (w.orders / w.clicks) * 100 : 0,
      ctr_basis: w.impressions ? 'Real: per-SKU clicks ÷ impressions' : 'Not available — Snapdeal traffic/impressions aren\'t scraped yet',
      cvr_basis: w.clicks ? 'Real: per-SKU orders ÷ clicks' : 'Not available — Snapdeal traffic/impressions aren\'t scraped yet',
    };
  }
  if (platform === 'flipkart') {
    const bh = data.account_metrics?.business_health || {};
    const ads = data.account_metrics?.ads || {};
    // Real active-listing count lives under listing_states (top-level `listings` is a stale/
    // unpopulated field from a scrape path that never fires for this account — confirmed it
    // reads 0 even when listing_states/inventory show real, non-zero numbers).
    const listingStates = data.account_metrics?.listing_states || {};
    // Home tab's today/yesterday counters — real, scraped every cycle, previously synced but
    // never read by anything (units_today/sales_today/new_orders/pending_rtd/returns_today).
    const home = data.account_metrics?.home ? { ...data.account_metrics.home, ads_spend: ads.spend, ads_roi: ads.roi, ads_ctr_pct: ads.ctr_pct, ads_cvr_pct: ads.cvr_pct } : null;
    return {
      revenue: bh.sales_7d || 0,
      orders: bh.units_7d || 0,
      impressions: bh.impressions_7d || 0,
      margin_pct: 0,
      listings: listingStates.active || data.listings || 0,
      avg_rating: data.avg_rating || 0,
      ctr_pct: 0,
      cvr_pct: bh.conversion_7d_pct || 0,
      ctr_basis: 'Not available — Flipkart only exposes ads-attributed clicks (see Today card), not organic CTR',
      cvr_basis: 'Real: Business Health conversion rate (organic, 7-day)',
      daily: home,
    };
  }
  return data;
}

// Rebuilds the cross-platform "winners" comparison from the final (corrected) platforms
// object instead of trusting amazon-server's own comparison field, which still ranks using
// its own embedded (possibly fabricated) per-platform numbers even after normalizeScraperSnapshot
// has fixed the per-platform figures above it.
function buildComparison(platforms) {
  const pick = (metric) => {
    let best = null;
    for (const [name, p] of Object.entries(platforms)) {
      const value = p?.[metric];
      if (typeof value !== 'number' || value <= 0) continue;
      if (!best || value > best.value) best = { platform: name, value };
    }
    return best;
  };
  return {
    highest_ctr: pick('ctr_pct'),
    highest_cvr: pick('cvr_pct'),
    most_orders: pick('orders'),
    highest_revenue: pick('revenue'),
    highest_margin: pick('margin_pct'),
  };
}

// Normalizes each scraper's real account/payment/return data into a common shape for the
// Account & Returns view. Deliberately leaves a field null rather than guessing when a
// platform doesn't expose a clean equivalent (e.g. Flipkart's payouts are postpaid-estimate
// based, not a simple "received" total) — `raw` carries the platform's own real figures
// through untouched so the frontend can still show them.
function buildAccountSummary(platform, data, syncedAt) {
  if (platform === 'meesho') {
    const pay = data?.account_metrics?.payments || {};
    const ret = data?.account_metrics?.returns || {};
    const disp = data?.account_metrics?.dispatch || {};
    return {
      synced_at: syncedAt,
      revenue_received: pay.completed_total ?? null,
      revenue_received_period: pay.completed_days ? `${pay.completed_days}d` : null,
      pending_payment: pay.upcoming_total ?? null,
      returns_count: ret.returned ?? null,
      return_rate_pct: ret.return_rate_pct ?? null,
      rto_count: ret.rto_count ?? null,
      rto_rate_pct: ret.rto_rate_pct ?? null,
      dispatch_health_pct: disp.dispatch_health_pct ?? null,
      settlements: null,
      raw: { payments: pay, returns: ret, dispatch: disp },
    };
  }
  if (platform === 'snapdeal') {
    const panel = data?.panel || {};
    const settlements = data?.settlements || [];
    const revenueReceived = settlements.reduce((sum, s) => sum + (s.amount || 0), 0);
    const ordersBooked = panel.orders_booked || 0;
    const ordersReturned = panel.orders_returned || 0;
    return {
      synced_at: syncedAt,
      revenue_received: settlements.length ? Math.round(revenueReceived * 100) / 100 : null,
      revenue_received_period: settlements.length ? `last ${settlements.length} settlements` : null,
      pending_payment: (panel.unsettled_cod ?? null) !== null || (panel.unsettled_ncod ?? null) !== null
        ? (panel.unsettled_cod || 0) + (panel.unsettled_ncod || 0) : null,
      returns_count: panel.orders_returned ?? null,
      return_rate_pct: ordersBooked ? Math.round((ordersReturned / ordersBooked) * 10000) / 100 : null,
      rto_count: null,
      rto_rate_pct: null,
      dispatch_health_pct: null,
      settlements: settlements.length ? settlements : null,
      raw: { panel },
    };
  }
  if (platform === 'flipkart') {
    const pay = data?.account_metrics?.payments || {};
    const ret = data?.account_metrics?.returns || {};
    const ords = data?.account_metrics?.orders || {};
    const bh = data?.account_metrics?.business_health || {};
    const upcomingTotal = [pay.estimate_0_total, pay.estimate_1_total, pay.estimate_2_total]
      .filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
    return {
      synced_at: syncedAt,
      revenue_received: null, // Flipkart exposes upcoming/postpaid estimates, not a clean "received" total
      revenue_received_period: null,
      pending_payment: upcomingTotal || null,
      outstanding_postpaid: pay.outstanding_amount ?? null,
      returns_count: (ret.completed || 0) + (ret.in_progress || 0),
      return_rate_pct: bh.buyer_returns_pct ?? null,
      rto_count: null,
      rto_rate_pct: bh.rto_pct ?? null,
      dispatch_health_pct: null,
      orders_completed: ords.completed ?? null,
      settlements: null,
      raw: { payments: pay, returns: ret, orders: ords },
    };
  }
  return null;
}

// ── Admin manual sync trigger (testing only) ────────────────────────────────
router.post('/admin/sync', async (req, res) => {
  const { platform } = req.body;
  try {
    const result = await marketplaceSync.manualSync(platform || 'all');
    return res.json({ success: true, result });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

router.get('/admin/sync-status', async (req, res) => {
  try {
    const platforms = ['amazon', 'meesho', 'snapdeal', 'flipkart'];
    const status = {};
    for (const p of platforms) {
      const meta = await marketplaceSync.getSnapshotWithMetadata(p);
      status[p] = meta;
    }
    return res.json(status);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

// ── Manual CSV/XLSX report import (Meesho, Snapdeal) ────────────────────────
// A ToS-safe alternative to browser-automated login: the seller exports a
// report from their own seller panel (routine, manual action) and uploads it
// here. Each platform's own python-service/<platform>/import_csv.py wraps the
// real importer (Meesho: auto-detects report kind from column headers;
// Snapdeal: reads by filename prefix under data/uploads/), then immediately
// recomputes KPIs/alerts and syncs to MongoDB so the upload shows up without
// waiting for the next scheduled cycle.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const PYTHON_SERVICE_ROOT = path.join(__dirname, '..', '..', 'python-service');

function venvPython(platform) {
  const sub = process.platform === 'win32' ? 'Scripts' : 'bin';
  const exe = process.platform === 'win32' ? 'python.exe' : 'python';
  return path.join(PYTHON_SERVICE_ROOT, platform, 'venv', sub, exe);
}

function runImportScript(platform, args) {
  const scriptPath = path.join(PYTHON_SERVICE_ROOT, platform, 'import_csv.py');
  const cwd = path.join(PYTHON_SERVICE_ROOT, platform);
  return new Promise((resolve, reject) => {
    execFile(venvPython(platform), [scriptPath, ...args], { cwd, timeout: 60_000 }, (err, stdout, stderr) => {
      // Parse from the end: the script's own result line is always printed last,
      // but mongo_sync.py and library warnings may print other lines before it.
      const lines = stdout.trim().split('\n').reverse();
      for (const line of lines) {
        try {
          return resolve(JSON.parse(line));
        } catch {
          // not the JSON line, keep looking
        }
      }
      reject(new Error(stderr?.trim() || err?.message || 'Import script produced no parseable output'));
    });
  });
}

router.post('/meesho/import', upload.single('file'), async (req, res) => {
  if (!req.file) return sendError(res, 'No file uploaded — expected a "file" field', 400);
  const tmpPath = path.join(os.tmpdir(), `meesho-import-${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  fs.writeFileSync(tmpPath, req.file.buffer);
  try {
    const result = await runImportScript('meesho', [tmpPath]);
    return res.status(result.ok ? 200 : 422).json(result);
  } catch (e) {
    return sendError(res, e.message, 502);
  } finally {
    fs.unlink(tmpPath, () => {});
  }
});

const SNAPDEAL_REPORT_KINDS = ['listings', 'orders', 'scorecard', 'ads'];

router.post('/snapdeal/import', upload.single('file'), async (req, res) => {
  if (!req.file) return sendError(res, 'No file uploaded — expected a "file" field', 400);
  const kind = req.body.reportType;
  if (!SNAPDEAL_REPORT_KINDS.includes(kind)) {
    return sendError(res, `reportType must be one of: ${SNAPDEAL_REPORT_KINDS.join(', ')}`, 400);
  }
  const uploadsDir = path.join(PYTHON_SERVICE_ROOT, 'snapdeal', 'data', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const destPath = path.join(uploadsDir, `${kind}_${Date.now()}.csv`);
  fs.writeFileSync(destPath, req.file.buffer);
  try {
    const result = await runImportScript('snapdeal', []);
    return res.json(result);
  } catch (e) {
    return sendError(res, e.message, 502);
  }
});

router.all('/v1/*', async (req, res) => {
  const subPath = req.path.slice('/v1'.length) || '/';

  // Unified alerts — amazon-server's own /v1/alerts is Amazon-only (account health,
  // pricing, deal/visitor guards against ASINs); Meesho/Snapdeal itemize their own open
  // alerts into Mongo (top_issues / alerts, synced by their own run_scheduler.py). Merge
  // all three into one normalized feed instead of the empty stub this used to be.
  if (req.method === 'GET' && subPath === '/alerts') {
    try {
      const [amazonRes, mongoSnapshots] = await Promise.all([
        marketflow.forward('v1', 'GET', '/alerts', { params: {} }).catch(() => ({ data: { alerts: [] } })),
        MarketflowSnapshot.find({ endpoint: 'overview', platform: { $in: ['meesho', 'snapdeal', 'flipkart'] } }).lean(),
      ]);

      const normalized = [];
      const AMAZON_SEVERITY = { red: 'critical', amber: 'warning', green: 'info' };
      for (const a of amazonRes.data?.alerts || []) {
        normalized.push({
          id: `amazon-${a.id}`, platform: 'amazon', title: a.title, message: a.message,
          severity: AMAZON_SEVERITY[a.severity] || 'info', fired_at: a.fired_at,
          suggested_action: a.suggested_action || null,
        });
      }
      for (const snap of mongoSnapshots) {
        if (snap.platform === 'meesho') {
          for (const t of snap.data?.top_issues || []) {
            normalized.push({
              id: `meesho-${t.id}`, platform: 'meesho', title: t.code, message: t.message,
              severity: ['critical', 'warning'].includes(t.severity) ? t.severity : 'info',
              fired_at: t.ts, suggested_action: null,
            });
          }
        } else if (snap.platform === 'snapdeal') {
          for (const a of snap.data?.alerts || []) {
            normalized.push({
              id: `snapdeal-${a.id}`, platform: 'snapdeal', title: a.title, message: a.reason,
              severity: ['critical', 'warning'].includes(a.severity) ? a.severity : 'info',
              fired_at: a.ts, suggested_action: a.fix || null,
            });
          }
        } else if (snap.platform === 'flipkart') {
          // Flipkart's own severities are 'high'/'medium'/'low' (not critical/warning/info).
          const FK_SEVERITY = { high: 'critical', medium: 'warning', low: 'info' };
          for (const r of snap.data?.recommendations || []) {
            normalized.push({
              id: `flipkart-${r.id}`, platform: 'flipkart', title: r.title, message: r.detail,
              severity: FK_SEVERITY[r.severity] || 'info',
              fired_at: r.created_at, suggested_action: null,
            });
          }
        }
      }
      normalized.sort((x, y) => new Date(y.fired_at || 0) - new Date(x.fired_at || 0));

      const counts = normalized.reduce((acc, a) => ({ ...acc, [a.severity]: (acc[a.severity] || 0) + 1 }), {});
      return res.json({
        alerts: normalized, total: normalized.length,
        critical: counts.critical || 0, warning: counts.warning || 0, info: counts.info || 0,
      });
    } catch (e) {
      console.error('Unified alerts error:', e);
      return res.json({ alerts: [], total: 0, critical: 0, warning: 0, info: 0 });
    }
  }

  // Traffic metrics (Analytics page) for meesho/snapdeal/flipkart — same fake-data problem as
  // /v1/trends/*: amazon-server has no real per-platform traffic reading for these 3 and was
  // returning one frozen snapshot (confirmed: the same fabricated 95.5% Meesho CVR appeared
  // here too). Build the real response from our own synced+normalized data instead.
  const trafficMatch = subPath === '/profitability/traffic';
  if (req.method === 'GET' && trafficMatch && ['meesho', 'snapdeal', 'flipkart'].includes(req.query.marketplace)) {
    const platform = req.query.marketplace;
    try {
      const snap = await MarketflowSnapshot.findOne({ platform, endpoint: 'overview' }).lean();
      const normalized = _withLastGoodFallback(
        `unified:${platform}`,
        normalizeScraperSnapshot(platform, snap?.data),
        (p) => !p.revenue && !p.orders && !p.impressions,
      );
      if (!normalized) return res.json({ marketplace: platform, traffic: null, source: 'no_data', period: 'latest' });
      const clicks = normalized.impressions ? Math.round((normalized.ctr_pct / 100) * normalized.impressions) : 0;
      return res.json({
        marketplace: platform,
        traffic: {
          impressions: normalized.impressions || 0,
          clicks,
          ctr_pct: normalized.ctr_pct || 0,
          cvr_pct: normalized.cvr_pct || 0,
          ctr_basis: 'Real synced scraper data (clicks ÷ impressions)',
          cvr_basis: 'Real synced scraper data (orders ÷ clicks, or platform-reported conversion)',
          traffic_basis: 'Real synced scraper data',
          pages_per_session: null,
          buy_box_pct: null,
          avg_order_value: normalized.orders ? Math.round(normalized.revenue / normalized.orders) : null,
          total_sales: normalized.revenue || 0,
          unique_products: normalized.listings || 0,
        },
        source: 'our_own_scraper_sync',
        period: 'latest_synced_reading',
      });
    } catch (e) {
      console.error('Traffic metrics error:', e);
      return res.json({ marketplace: platform, traffic: null, source: 'error', period: 'latest' });
    }
  }

  // Recommendations — amazon-server's engine already reads the same shared Mongo data for
  // every platform and generates cross-platform recommendations (confirmed: amazon_in,
  // flipkart, meesho, snapdeal all present in its response), so this is a straight forward
  // instead of a bespoke per-platform recommendation builder.
  if (req.method === 'GET' && subPath === '/recommendations/action-plan') {
    try {
      const { data } = await marketflow.forward('v1', 'GET', '/recommendations/action-plan', { params: {} });
      return res.json({ recommendations: data?.recommendations || [], total: data?.recommendations_count ?? (data?.recommendations || []).length });
    } catch (e) {
      return res.json({ recommendations: [], total: 0 });
    }
  }

  // Special handling for robot endpoint to support platform parameter
  if (req.method === 'GET' && subPath === '/robot') {
    const platform = req.query.platform || 'amazon';
    const platformNames = { amazon: 'Amazon', flipkart: 'Flipkart', meesho: 'Meesho', snapdeal: 'Snapdeal' };

    // For Amazon, forward to amazon-server (the only platform with a real robot/job-health concept)
    if (platform === 'amazon') {
      try {
        const { status, data } = await marketflow.forward('v1', 'GET', '/robot', { params: {} });
        return res.status(status).json(data);
      } catch (e) {
        return sendError(res, e.message, e.status || 502);
      }
    }

    // Flipkart/Meesho/Snapdeal have no live robot/job-runner API — they're cron-scheduled Python
    // scrapers that sync into MarketflowSnapshot. Report honest sync recency instead of inventing
    // fake "healthy" job/run data.
    if (['flipkart', 'meesho', 'snapdeal'].includes(platform)) {
      const snap = await MarketflowSnapshot.findOne({ platform, endpoint: 'overview' }).sort({ syncedAt: -1 }).lean();
      const staleMs = snap ? Date.now() - new Date(snap.syncedAt).getTime() : null;
      const state = !snap ? 'unknown' : staleMs > 6 * 3600000 ? 'stale' : 'healthy';
      return res.json({
        id: `robo-${platform}`,
        name: `${platformNames[platform]} Sync`,
        platform,
        how: `Scheduled scraper syncs ${platformNames[platform]} overview data into the database`,
        state,
        message: snap ? `Last synced ${snap.syncedAt}` : 'No sync data recorded yet.',
        beat: snap?.syncedAt || null,
        jobs: [],
        runs: [],
      });
    }

    return sendError(res, `Unknown platform "${platform}"`, 404);
  }

  // Special handling for unified dashboard — aggregate from all platforms
  if (req.method === 'GET' && subPath === '/dashboard/unified') {
    try {
      const { data: amazonData } = await marketflow.forward('v1', 'GET', '/dashboard/unified', { params: {} }).catch(() => ({ platforms: {}, data: {} }));

      // amazon-server's /dashboard/unified bundles its own built-in numbers for every
      // platform (meesho/snapdeal/flipkart included), but those are not what our own
      // scrapers (python-service/*, synced into MarketflowSnapshot) actually measured —
      // real vs amazon-server's embedded values have been observed to disagree sharply
      // (e.g. a 95%+ CVR that isn't real). For these 3 platforms, our own synced Mongo
      // data is authoritative and must win; amazon-server's platforms object is only used
      // as a fallback/for platforms we don't scrape ourselves (myntra, jiomart, amazon_in).
      const mongoSnapshots = await MarketflowSnapshot.find({ endpoint: 'overview' }).lean();
      const platforms = { ...amazonData.platforms };

      for (const snap of mongoSnapshots) {
        // 'amazon' is a legacy duplicate of amazon_in written by marketplaceSync.service.js's
        // own cron sync — a whole nested {platforms, comparison, ...} dashboard object, not a
        // single platform's flat stats, so it must never be merged in as its own platform entry.
        if (snap.platform === 'amazon') continue;
        if (['meesho', 'snapdeal', 'flipkart'].includes(snap.platform)) {
          const normalized = normalizeScraperSnapshot(snap.platform, snap.data);
          const resolved = _withLastGoodFallback(
            `unified:${snap.platform}`,
            normalized,
            (p) => !p.revenue && !p.orders && !p.impressions,
          );
          platforms[snap.platform] = resolved || platforms[snap.platform];
          // Capture from the fallback-resolved value, not the raw read — a momentarily-empty
          // read (the known other-writer issue) shouldn't cost that platform its trend point
          // for the day when we already know its real last-good value.
          captureTrendPointIfNeeded(snap.platform, resolved).catch(() => {});
          continue;
        }
        if (platforms[snap.platform]) continue;
        platforms[snap.platform] = snap.data || { revenue: 0, orders: 0, impressions: 0, margin_pct: 0 };
      }

      // Calculate totals from all platforms
      const totals = Object.values(platforms).reduce((acc, p) => ({
        revenue: (acc.revenue || 0) + (p.revenue || 0),
        orders: (acc.orders || 0) + (p.orders || 0),
        impressions: (acc.impressions || 0) + (p.impressions || 0),
      }), { revenue: 0, orders: 0, impressions: 0 });

      return res.json({
        ...amazonData,
        platforms,
        total_revenue: totals.revenue,
        total_orders: totals.orders,
        total_impressions: totals.impressions,
        avg_margin: amazonData?.avg_margin ?? null,
        comparison: buildComparison(platforms),
      });
    } catch (e) {
      console.error('Unified dashboard error:', e);
      return res.json({ platforms: {}, total_revenue: 0, total_orders: 0, total_impressions: 0 });
    }
  }

  // Account & Returns summary — real settlement/payout and return/RTO figures from each
  // scraper, not the per-order revenue/orders KPIs the main dashboard already shows.
  // Only built for meesho/snapdeal/flipkart (our own scrapers); amazon's equivalent already
  // lives in amazon-server's own account overview.
  if (req.method === 'GET' && subPath === '/account-summary') {
    try {
      const mongoSnapshots = await MarketflowSnapshot.find({
        endpoint: 'overview',
        platform: { $in: ['meesho', 'snapdeal', 'flipkart'] },
      }).lean();

      const platforms = {};
      for (const snap of mongoSnapshots) {
        const built = buildAccountSummary(snap.platform, snap.data, snap.syncedAt);
        platforms[snap.platform] = _withLastGoodFieldFallback(`account-summary:${snap.platform}`, built);
      }
      return res.json({ platforms });
    } catch (e) {
      console.error('Account summary error:', e);
      return res.json({ platforms: {} });
    }
  }

  // Real trend history for meesho/snapdeal/flipkart — reads MarketflowTrendPoint (captured by
  // captureTrendPointIfNeeded above) instead of proxying to amazon-server, which has no real
  // per-day history for these platforms and was repeating one flat snapshot across every date.
  // amazon_in keeps proxying below (falls through the allowlist) since its own trend data is a
  // separate, already-tracked issue (not addressed here).
  if (req.method === 'GET' && subPath === '/trends/compare/all') {
    try {
      const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffDate = cutoff.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      const points = await MarketflowTrendPoint.find({
        platform: { $in: ['meesho', 'snapdeal', 'flipkart'] },
        date: { $gte: cutoffDate },
      }).sort({ date: 1 }).lean();

      const platforms = {};
      for (const p of points) {
        if (!platforms[p.platform]) platforms[p.platform] = [];
        platforms[p.platform].push({ date: p.date, revenue: p.revenue, orders: p.orders, impressions: p.impressions, ctr_pct: p.ctr_pct, cvr_pct: p.cvr_pct });
      }
      return res.json({ platforms });
    } catch (e) {
      console.error('Trends compare error:', e);
      return res.json({ platforms: {} });
    }
  }

  const trendsMatch = subPath.match(/^\/trends\/([^/]+)$/);
  if (req.method === 'GET' && trendsMatch && ['meesho', 'snapdeal', 'flipkart'].includes(trendsMatch[1])) {
    const platform = trendsMatch[1];
    try {
      const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffDate = cutoff.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      const points = await MarketflowTrendPoint.find({ platform, date: { $gte: cutoffDate } }).sort({ date: 1 }).lean();
      const data = points.map((p) => ({
        date: p.date, revenue: p.revenue, orders: p.orders, impressions: p.impressions,
        clicks: p.impressions ? Math.round((p.ctr_pct / 100) * p.impressions) : 0,
        ctr_pct: p.ctr_pct, cvr_pct: p.cvr_pct, alerts_open: 0, alerts_critical: 0,
      }));
      const latest = data.length ? data[data.length - 1] : null;
      const prev = data.length > 1 ? data[data.length - 2] : null;
      const change = latest && prev
        ? {
            revenue_pct: prev.revenue ? ((latest.revenue - prev.revenue) / prev.revenue) * 100 : null,
            orders_pct: prev.orders ? ((latest.orders - prev.orders) / prev.orders) * 100 : null,
          }
        : null;
      return res.json({
        marketplace: platform, period_days: days, data, latest, change,
        note: data.length < 2 ? 'Real daily tracking just started for this platform — history builds up one real data point per day from here.' : undefined,
      });
    } catch (e) {
      console.error('Trends error:', e);
      return res.json({ marketplace: platform, period_days: 30, data: [], latest: null, change: null });
    }
  }

  const allowed = v1Allowlist.some((rule) => rule.method === req.method && rule.pattern.test(subPath));
  if (!allowed) return sendError(res, `Marketflow route not in allowlist: ${req.method} ${subPath}`, 404);

  try {
    const { status, data } = await marketflow.forward('v1', req.method, subPath, { params: req.query, data: req.body });
    return res.status(status).json(data);
  } catch (e) {
    return sendError(res, e.message, e.status || 502);
  }
});

const marketplaceSync = require('../services/marketplaceSync.service');

const mountMongoBacked = (prefix, platform) => {
  router.get(`${prefix}/overview`, async (req, res) => {
    try {
      console.log(`[marketflow] GET ${prefix}/overview for platform=${platform}`);
      const metadata = await marketplaceSync.getSnapshotWithMetadata(platform);

      if (!metadata.data) {
        console.log(`[marketflow] ❌ No snapshot found for ${platform}`);
        return sendError(res, `No synced data yet for ${platform} — its scraper process may not have run yet`, 503);
      }

      console.log(`[marketflow] ✓ Returning ${platform} data (stale=${metadata.isStale})`);
      return res.json({
        ...metadata.data,
        __sync: {
          syncedAt: metadata.syncedAt,
          isStale: metadata.isStale,
          timeSinceSyncHours: metadata.timeSinceSyncHours,
        },
      });
    } catch (err) {
      console.error(`[marketflow] ERROR in ${platform}/overview:`, err.message);
      return sendError(res, err.message, 500);
    }
  });
};

mountMongoBacked('/meesho', 'meesho');
mountMongoBacked('/snapdeal', 'snapdeal');
mountMongoBacked('/flipkart', 'flipkart');

module.exports = router;
