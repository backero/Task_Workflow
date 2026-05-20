const router = require('express').Router();
const Task = require('../models/Task');
const Lead = require('../models/Lead');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeManagerOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, getDateRange } = require('../utils/helpers');

router.use(authenticate, orgIsolation, authorizeManagerOrAbove);

// Employee performance report
router.get('/employee-performance', asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, department } = req.query;
  const orgId = req.user.organizationId;
  const { start, end } = getDateRange('month');

  const filter = { organizationId: orgId };
  if (department) filter.department = department;

  const performance = await Task.aggregate([
    { $match: { ...filter, createdAt: { $gte: dateFrom ? new Date(dateFrom) : start, $lte: dateTo ? new Date(dateTo) : end } } },
    {
      $group: {
        _id: '$assignedTo',
        totalTasks: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        overdue: { $sum: { $cond: ['$isOverdue', 1, 0] } },
        avgProgress: { $avg: '$progress' },
        rejections: { $sum: '$rejectionCount' },
      },
    },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'employee' } },
    { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
    { $addFields: { completionRate: { $cond: [{ $gt: ['$totalTasks', 0] }, { $multiply: [{ $divide: ['$completed', '$totalTasks'] }, 100] }, 0] } } },
    { $sort: { completionRate: -1 } },
  ]);

  sendSuccess(res, { report: performance });
}));

// Department productivity
router.get('/department-productivity', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const report = await Task.aggregate([
    { $match: { organizationId: orgId } },
    {
      $group: {
        _id: '$department',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        overdue: { $sum: { $cond: ['$isOverdue', 1, 0] } },
        pending: { $sum: { $cond: [{ $in: ['$status', ['Pending', 'Assigned']] }, 1, 0] } },
      },
    },
    { $addFields: { completionRate: { $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }, 0] } } },
    { $sort: { completionRate: -1 } },
  ]);
  sendSuccess(res, { report });
}));

// Sales conversion report
router.get('/sales-conversion', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { dateFrom, dateTo } = req.query;
  const filter = { organizationId: orgId };
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const [leadsByStatus, leadsBySource, conversionByEmployee] = await Promise.all([
    Lead.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$estimatedValue' } } }]),
    Lead.aggregate([{ $match: filter }, { $group: { _id: '$source', count: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'Won'] }, 1, 0] } } } }]),
    Lead.aggregate([
      { $match: filter },
      { $group: { _id: '$assignedTo', total: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ['$status', 'Won'] }, 1, 0] } }, value: { $sum: '$dealValue' } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'employee' } },
      { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
    ]),
  ]);

  sendSuccess(res, { report: { leadsByStatus, leadsBySource, conversionByEmployee } });
}));

// Financial summary
router.get('/financial-summary', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { year = new Date().getFullYear() } = req.query;

  const monthlyData = await Transaction.aggregate([
    { $match: { organizationId: orgId, date: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } } },
    { $group: { _id: { month: { $month: '$date' }, type: '$type' }, total: { $sum: '$amount' } } },
    { $sort: { '_id.month': 1 } },
  ]);

  sendSuccess(res, { report: { monthlyData, year } });
}));

module.exports = router;
