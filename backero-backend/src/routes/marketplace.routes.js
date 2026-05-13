const router = require('express').Router();
const Task = require('../models/Task');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { asyncHandler, sendSuccess, paginate, paginateResponse } = require('../utils/helpers');
const { MARKETPLACE_PLATFORMS } = require('../utils/constants');

router.use(authenticate, orgIsolation);

router.get('/tasks', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, platform, status } = req.query;
  const { skip } = paginate(page, limit);
  const filter = { organizationId: req.user.organizationId, department: 'Marketplace' };
  if (platform) filter.platform = platform;
  if (status) filter.status = status;

  const [tasks, total] = await Promise.all([
    Task.find(filter).populate('assignedTo', 'firstName lastName avatar').sort({ dueDate: 1 }).skip(skip).limit(parseInt(limit)),
    Task.countDocuments(filter),
  ]);
  sendSuccess(res, paginateResponse(tasks, total, page, limit));
}));

router.get('/analytics', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const platformStats = await Task.aggregate([
    { $match: { organizationId: orgId, department: 'Marketplace' } },
    { $group: { _id: '$platform', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } }, overdue: { $sum: { $cond: ['$isOverdue', 1, 0] } } } },
    { $addFields: { completionRate: { $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }, 0] } } },
  ]);

  const healthScore = platformStats.reduce((acc, p) => {
    acc[p._id] = Math.round(p.completionRate - (p.overdue * 5));
    return acc;
  }, {});

  sendSuccess(res, { analytics: { platformStats, healthScore, platforms: MARKETPLACE_PLATFORMS } });
}));

module.exports = router;
