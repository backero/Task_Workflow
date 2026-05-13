const router = require('express').Router();
const Organization = require('../models/Organization');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove } = require('../middleware/role.middleware');
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

module.exports = router;
