const router = require('express').Router();
const Campaign = require('../models/Campaign');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');

router.use(authenticate, orgIsolation);

router.get('/campaigns', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, platform, type } = req.query;
  const { skip } = paginate(page, limit);
  const filter = { organizationId: req.user.organizationId };
  if (status) filter.status = status;
  if (platform) filter.platform = platform;
  if (type) filter.type = type;

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter).populate('assignedTo', 'firstName lastName avatar').populate('managedBy', 'firstName lastName').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Campaign.countDocuments(filter),
  ]);
  sendSuccess(res, paginateResponse(campaigns, total, page, limit));
}));

router.post('/campaigns', asyncHandler(async (req, res) => {
  const campaign = await Campaign.create({ ...req.body, organizationId: req.user.organizationId, createdBy: req.user._id });
  sendSuccess(res, { campaign }, 'Campaign created', 201);
}));

router.get('/campaigns/:id', asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
    .populate('assignedTo', 'firstName lastName avatar').populate('managedBy', 'firstName lastName');
  if (!campaign) return sendError(res, 'Campaign not found.', 404);
  sendSuccess(res, { campaign });
}));

router.put('/campaigns/:id', asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { ...req.body, updatedBy: req.user._id },
    { new: true }
  );
  if (!campaign) return sendError(res, 'Campaign not found.', 404);
  sendSuccess(res, { campaign }, 'Campaign updated');
}));

router.patch('/campaigns/:id/metrics', asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { $set: { metrics: req.body } },
    { new: true }
  );
  if (!campaign) return sendError(res, 'Campaign not found.', 404);
  sendSuccess(res, { campaign }, 'Metrics updated');
}));

router.get('/analytics', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const [statusStats, platformStats] = await Promise.all([
    Campaign.aggregate([{ $match: { organizationId: orgId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Campaign.aggregate([{ $match: { organizationId: orgId } }, { $group: { _id: '$platform', count: { $sum: 1 }, totalSpend: { $sum: '$spent' } } }]),
  ]);
  sendSuccess(res, { analytics: { statusStats, platformStats } });
}));

module.exports = router;
