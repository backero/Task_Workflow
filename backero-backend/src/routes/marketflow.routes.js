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
const { v1Allowlist } = require('../utils/marketflowAllowlist');
const { sendError } = require('../utils/helpers');

router.use(authenticate);

// Flattens each scraper's own nested sync shape (python-service/{meesho,snapdeal,flipkart})
// into the {revenue, orders, impressions, margin_pct} shape the unified dashboard expects.
// Only maps fields the scraper actually measured — never fabricates a number it doesn't have.
function normalizeScraperSnapshot(platform, data) {
  if (!data) return null;
  if (platform === 'meesho') {
    const k = data.kpis || {};
    return {
      revenue: k.sales_7d || 0,
      orders: k.orders_7d || 0,
      impressions: k.impressions_7d || 0,
      margin_pct: 0,
      listings: k.listings || 0,
      avg_rating: k.avg_rating || 0,
      ctr_pct: k.impressions_7d ? (k.clicks_7d / k.impressions_7d) * 100 : 0,
      cvr_pct: k.conversion_pct_7d || 0,
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
    };
  }
  if (platform === 'flipkart') {
    const bh = data.account_metrics?.business_health || {};
    return {
      revenue: bh.sales_7d || 0,
      orders: bh.units_7d || 0,
      impressions: bh.impressions_7d || 0,
      margin_pct: 0,
      listings: data.listings || 0,
      avg_rating: data.avg_rating || 0,
      ctr_pct: 0,
      cvr_pct: bh.conversion_7d_pct || 0,
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
        MarketflowSnapshot.find({ endpoint: 'overview', platform: { $in: ['meesho', 'snapdeal'] } }).lean(),
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
          platforms[snap.platform] = normalizeScraperSnapshot(snap.platform, snap.data) || platforms[snap.platform];
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
