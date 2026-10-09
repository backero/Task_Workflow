/**
 * Proxy routes for the "Marketflow" section — forwards allowlisted calls to
 * the 4 marketplace-automation services (see src/services/marketflow.service.js).
 * JWT-only (no orgIsolation): these external services have no organizationId
 * concept, same precedent as socialEngine.routes.js.
 */
const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const marketflow = require('../services/marketflow.service');
const { v1Allowlist, meeshoAllowlist, snapdealAllowlist, flipkartAllowlist } = require('../utils/marketflowAllowlist');
const { sendError } = require('../utils/helpers');

router.use(authenticate);

const mount = (prefix, target, allowlist) => {
  router.all(`${prefix}/*`, async (req, res) => {
    const subPath = req.path.slice(prefix.length) || '/';
    const allowed = allowlist.some((rule) => rule.method === req.method && rule.pattern.test(subPath));
    if (!allowed) return sendError(res, `Marketflow route not in allowlist: ${req.method} ${subPath}`, 404);

    try {
      const { status, data } = await marketflow.forward(target, req.method, subPath, { params: req.query, data: req.body });
      return res.status(status).json(data);
    } catch (e) {
      return sendError(res, e.message, e.status || 502);
    }
  });
};

mount('/v1',       'v1',       v1Allowlist);
mount('/meesho',   'meesho',   meeshoAllowlist);
mount('/snapdeal', 'snapdeal', snapdealAllowlist);
mount('/flipkart', 'flipkart', flipkartAllowlist);

module.exports = router;
