const router = require('express').Router();
const Task = require('../models/Task');
const MarketplaceDaily = require('../models/MarketplaceDaily');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { asyncHandler, sendSuccess, paginate, paginateResponse } = require('../utils/helpers');
const { MARKETPLACE_PLATFORMS } = require('../utils/constants');

router.use(authenticate, orgIsolation);

// ── Tasks ─────────────────────────────────────────────────────────────────────

router.get('/tasks', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, platform, status } = req.query;
  const { skip } = paginate(page, limit);
  const filter = { organizationId: req.user.organizationId, department: 'Marketplace' };
  if (platform) filter.platform = platform;
  if (status) filter.status = status;

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('assignedTo', 'firstName lastName avatar')
      .populate('subTasks', 'status title')
      .sort({ dueDate: 1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Task.countDocuments(filter),
  ]);
  sendSuccess(res, paginateResponse(tasks, total, page, limit));
}));

// ── Platform analytics ────────────────────────────────────────────────────────

router.get('/analytics', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const platformStats = await Task.aggregate([
    { $match: { organizationId: orgId, department: 'Marketplace' } },
    {
      $group: {
        _id: '$platform',
        total:     { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        overdue:   { $sum: { $cond: ['$isOverdue', 1, 0] } },
      },
    },
    {
      $addFields: {
        completionRate: {
          $cond: [
            { $gt: ['$total', 0] },
            { $multiply: [{ $divide: ['$completed', '$total'] }, 100] },
            0,
          ],
        },
      },
    },
  ]);

  const healthScore = platformStats.reduce((acc, p) => {
    acc[p._id] = Math.round(p.completionRate - (p.overdue * 5));
    return acc;
  }, {});

  sendSuccess(res, { analytics: { platformStats, healthScore, platforms: MARKETPLACE_PLATFORMS } });
}));

// ── Daily Numbers ─────────────────────────────────────────────────────────────

// POST /marketplace/daily — upsert today's (or given date's) numbers
router.post('/daily', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { totalSales, ctr, cvr, adSpend, adRevenue, returns, worstSkuCvr, notes, date } = req.body;

  const entryDate = date ? new Date(date) : new Date();
  entryDate.setUTCHours(0, 0, 0, 0);

  const entry = await MarketplaceDaily.findOneAndUpdate(
    { organizationId: orgId, date: entryDate },
    {
      totalSales: Number(totalSales) || 0,
      ctr:        Number(ctr)        || 0,
      cvr:        Number(cvr)        || 0,
      adSpend:    Number(adSpend)    || 0,
      adRevenue:  Number(adRevenue)  || 0,
      returns:    Number(returns)    || 0,
      worstSkuCvr: Number(worstSkuCvr) || 0,
      notes:      notes || '',
      createdBy:  req.user._id,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  sendSuccess(res, { entry });
}));

// GET /marketplace/daily/week — Mon-Sun entries for current week
router.get('/daily/week', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;

  // Use a wide ±8-day window to avoid timezone edge cases, then return all
  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setUTCDate(now.getUTCDate() - 7);
  rangeStart.setUTCHours(0, 0, 0, 0);

  const rangeEnd = new Date(now);
  rangeEnd.setUTCDate(now.getUTCDate() + 1);
  rangeEnd.setUTCHours(23, 59, 59, 999);

  const entries = await MarketplaceDaily.find({
    organizationId: orgId,
    date: { $gte: rangeStart, $lte: rangeEnd },
  }).sort({ date: 1 }).limit(14); // at most 2 weeks

  sendSuccess(res, { entries });
}));

// GET /marketplace/daily/today — today's entry (pre-fill form)
router.get('/daily/today', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const entry = await MarketplaceDaily.findOne({ organizationId: orgId, date: today });
  sendSuccess(res, { entry: entry || null });
}));

module.exports = router;
