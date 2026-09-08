const router = require('express').Router();
const crypto = require('crypto');
const Organization = require('../models/Organization');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove } = require('../middleware/role.middleware');
const { hashApiKey } = require('../middleware/apiKeyAuth.middleware');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');

router.use(authenticate, orgIsolation);

router.get('/me', asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organizationId);
  if (!org) return sendError(res, 'Organization not found.', 404);
  sendSuccess(res, { organization: org });
}));

router.put('/me', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const { slug, createdBy, _id, ...updates } = req.body;
  const org = await Organization.findByIdAndUpdate(req.user.organizationId, updates, { new: true, runValidators: true });
  sendSuccess(res, { organization: org }, 'Organization updated');
}));

// ── Social media automation integration (Marketing) ────────────────────────
// Issues a fresh API key + webhook secret. Both are returned ONLY here, in
// plaintext, once — Backero only ever stores the API key's hash afterward.
router.post('/social-automation/generate-key', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId.toString();
  const rawSecret = crypto.randomBytes(32).toString('hex');
  const apiKey = `${orgId}.${rawSecret}`;
  const webhookSecret = crypto.randomBytes(32).toString('hex');

  await Organization.findByIdAndUpdate(orgId, {
    'socialAutomation.apiKeyHash': hashApiKey(apiKey),
    'socialAutomation.apiKeyPreview': apiKey.slice(-6),
    'socialAutomation.webhookSecret': webhookSecret,
    'socialAutomation.generatedAt': new Date(),
  });

  sendSuccess(res, { apiKey, webhookSecret }, 'Save these now — the API key and webhook secret will not be shown again.');
}));

router.get('/social-automation/status', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organizationId)
    .select('socialAutomation.apiKeyPreview socialAutomation.generatedAt socialAutomation.defaultCallbackUrl');
  sendSuccess(res, {
    configured: !!org?.socialAutomation?.apiKeyPreview,
    apiKeyPreview: org?.socialAutomation?.apiKeyPreview || null,
    generatedAt: org?.socialAutomation?.generatedAt || null,
    defaultCallbackUrl: org?.socialAutomation?.defaultCallbackUrl || null,
  });
}));

router.put('/social-automation/callback-url', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const { defaultCallbackUrl } = req.body;
  await Organization.findByIdAndUpdate(req.user.organizationId, { 'socialAutomation.defaultCallbackUrl': defaultCallbackUrl || '' });
  sendSuccess(res, {}, 'Default callback URL saved');
}));

module.exports = router;
