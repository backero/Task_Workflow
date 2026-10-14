/**
 * Routes for the "Marketflow" section.
 *
 * amazon (/v1/*): still a live Node service (marketflow-services/amazon-server,
 * unchanged) — forwarded via the allowlisted proxy, same as before.
 *
 * snapdeal/flipkart (/snapdeal, /flipkart): these no longer run HTTP servers at
 * all — python-service/{snapdeal,flipkart}/run_scheduler.py runs just their
 * scraper/scheduler logic and pushes "overview" data into MongoDB
 * (python-service/mongo_sync.py) on its own schedule. These routes read that
 * collection directly; there is nothing left to proxy to.
 *
 * meesho (/meesho): Meesho blocks this VPS's datacenter IP at the network level
 * (Akamai edgesuite.net "Access Denied"), so python-service/meesho's own scraper
 * can never succeed here and its MongoDB snapshot is permanently empty. Meesho's
 * real data instead comes from the user's own PC robot, synced to
 * /opt/platforms/project and read by amazon-server directly (2026-10-13 fix) —
 * built into one "overview" shape below from several already-allowlisted v1
 * endpoints, instead of reading Mongo.
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

mountMongoBacked('/snapdeal', 'snapdeal');
mountMongoBacked('/flipkart', 'flipkart');

// Meesho: see module comment above — built from amazon-server's real, synced data
// instead of Mongo (that scraper can never succeed on this VPS).
router.get('/meesho/overview', async (req, res) => {
  try {
    const [listingsRes, alertStatsRes, recsRes, unifiedRes, alertsRes] = await Promise.all([
      marketflow.forward('v1', 'GET', '/platform/meesho/listings'),
      marketflow.forward('v1', 'GET', '/alerts/stats', { params: { marketplace: 'meesho' } }),
      marketflow.forward('v1', 'GET', '/recommendations/action-plan', { params: { marketplace: 'meesho' } }),
      marketflow.forward('v1', 'GET', '/dashboard/unified'),
      marketflow.forward('v1', 'GET', '/alerts', { params: { marketplace: 'meesho' } }),
    ]);

    const listings = listingsRes.data?.listings || [];
    const live = listings.filter((l) => l.status === 'live').length;
    const blocked = listings.filter((l) => l.status && l.status !== 'live').length;
    const ratings = listings.map((l) => l.rating).filter((v) => v != null);
    const qualityScores = listings.map((l) => l.quality_score).filter((v) => v != null);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    const meeshoUnified = unifiedRes.data?.platforms?.meesho || {};
    const recommendations = recsRes.data?.recommendations || [];
    const alerts = (alertsRes.data?.alerts || []).slice(0, 5);

    res.json({
      kpis: {
        listings: listings.length,
        live,
        blocked,
        orders_7d: meeshoUnified.orders ?? 0,
        impressions_7d: meeshoUnified.impressions ?? 0,
        avg_quality_score: avg(qualityScores),
        avg_rating: avg(ratings),
        open_critical_alerts: alertStatsRes.data?.stats?.critical || 0,
        open_recs: recommendations.length,
      },
      top_issues: alerts.map((a) => ({
        id: a.id,
        severity: a.severity === 'red' ? 'critical' : a.severity === 'amber' ? 'warning' : 'info',
        code: a.rule_id,
        message: a.title || a.message,
        ts: a.fired_at,
      })),
    });
  } catch (e) {
    return sendError(res, e.message, e.status || 502);
  }
});

module.exports = router;
