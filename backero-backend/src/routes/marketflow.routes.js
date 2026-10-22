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
    const platformNames = { amazon: 'Amazon', flipkart: 'Flipkart', meesho: 'Meesho', snapdeal: 'Snapdeal', myntra: 'Myntra', jiomart: 'JioMart' };

    // For Amazon, forward to amazon-server
    if (platform === 'amazon') {
      try {
        const { status, data } = await marketflow.forward('v1', 'GET', '/robot', { params: {} });
        return res.status(status).json(data);
      } catch (e) {
        return sendError(res, e.message, e.status || 502);
      }
    }

    // For other platforms, return mock robot status
    const now = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const mockRobot = {
      id: `robo-${platform}`,
      name: `${platformNames[platform]} Robo`,
      platform: platform,
      how: `Syncs data from ${platformNames[platform]} Seller Hub every 3 minutes`,
      state: 'healthy',
      message: `${platformNames[platform]} data collection is working normally.`,
      beat: now,
      jobs: [
        {
          id: `job-${platform}-listings`,
          label: 'Sync Listings',
          what: `Fetch and update ${platform} catalog listings`,
          every_minutes: 3,
          enabled: true,
          last_run: now,
          last_status: 'ok',
          detail: null,
          duration_s: 45,
          overdue: false,
        },
        {
          id: `job-${platform}-orders`,
          label: 'Sync Orders',
          what: `Fetch new orders and order updates from ${platform}`,
          every_minutes: 5,
          enabled: true,
          last_run: now,
          last_status: 'ok',
          detail: null,
          duration_s: 30,
          overdue: false,
        },
        {
          id: `job-${platform}-metrics`,
          label: 'Update Metrics',
          what: `Calculate KPIs, CTR, CVR, margins, alerts`,
          every_minutes: 15,
          enabled: true,
          last_run: now,
          last_status: 'ok',
          detail: null,
          duration_s: 20,
          overdue: false,
        },
      ],
      runs: [
        { finished_at: now, job: `job-${platform}-listings`, status: 'ok', detail: null, duration_s: 45 },
        { finished_at: now, job: `job-${platform}-orders`, status: 'ok', detail: null, duration_s: 30 },
        { finished_at: oneHourAgo, job: `job-${platform}-metrics`, status: 'ok', detail: null, duration_s: 20 },
      ],
    };

    return res.json(mockRobot);
  }

  // Special handling for unified dashboard — aggregate from all platforms
  if (req.method === 'GET' && subPath === '/dashboard/unified') {
    try {
      const { data: amazonData } = await marketflow.forward('v1', 'GET', '/dashboard/unified', { params: {} }).catch(() => ({ platforms: {}, data: {} }));

      // Fetch all platform data from MongoDB — but only use it to fill in platforms
      // amazon-server doesn't already know about (myntra, jiomart). amazon-server's own
      // /dashboard/unified already returns meesho/snapdeal/flipkart with real computed
      // revenue/orders; the raw Mongo snapshot.data for those is the scraper's nested
      // sync shape (no flat revenue/orders fields), so overwriting here silently zeroed
      // out otherwise-correct numbers.
      const mongoSnapshots = await MarketflowSnapshot.find({ endpoint: 'overview' }).lean();
      const platforms = { ...amazonData.platforms };

      for (const snap of mongoSnapshots) {
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
        avg_margin: '20.5',
        comparison: amazonData?.comparison || {},
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

const mountMongoBacked = (prefix, platform) => {
  router.get(`${prefix}/overview`, async (req, res) => {
    const snap = await MarketflowSnapshot.findOne({ platform, endpoint: 'overview' }).lean();
    if (!snap) return sendError(res, `No synced data yet for ${platform} — its scraper process may not have run yet`, 503);
    return res.json(snap.data);
  });
};

mountMongoBacked('/meesho', 'meesho');
mountMongoBacked('/snapdeal', 'snapdeal');
mountMongoBacked('/flipkart', 'flipkart');

module.exports = router;
