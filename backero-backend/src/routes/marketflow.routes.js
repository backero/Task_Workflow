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
const { authenticate } = require('../middleware/auth.middleware');
const marketflow = require('../services/marketflow.service');
const MarketflowSnapshot = require('../models/MarketflowSnapshot');
const { v1Allowlist } = require('../utils/marketflowAllowlist');
const { sendError } = require('../utils/helpers');

router.use(authenticate);

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

mountMongoBacked('/meesho', 'meesho');
mountMongoBacked('/snapdeal', 'snapdeal');
mountMongoBacked('/flipkart', 'flipkart');

module.exports = router;
