const Task = require('../models/Task');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const Product     = require('../models/Product');
const Transaction = require('../models/Transaction');
const { success } = require('../utils/response');
const logger = require('../utils/logger');

const getDashboardOverview = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const [taskStats, userStats, recentActivity, inventoryAlerts, financeStats] = await Promise.all([
      Task.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$isActive', count: { $sum: 1 } } },
      ]),
      ActivityLog.find({ organizationId: orgId })
        .sort({ createdAt: -1 })
        .limit(15)
        .populate('userId', 'name phone')
        .lean(),
      Product.countDocuments({
        organizationId: orgId,
        isActive: true,
        $expr: { $lte: ['$quantity', '$minStockThreshold'] },
      }).catch(() => 0),
      Transaction.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ]).catch(() => []),
    ]);

    const byStatus = taskStats.reduce((a, s) => { a[s._id] = s.count; return a; }, {});
    const byActive = userStats.reduce((a, s) => { a[String(s._id)] = s.count; return a; }, {});
    const totalTasks = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const pending = (byStatus.TODO || 0) + (byStatus.IN_PROGRESS || 0) + (byStatus.IN_REVIEW || 0);

    const overdue = await Task.countDocuments({
      organizationId: orgId,
      status: { $ne: 'DONE' },
      dueDate: { $lt: new Date() },
    });

    return success(res, {
      tasks: {
        total: totalTasks,
        pending,
        completed: byStatus.DONE || 0,
        overdue,
        todo: byStatus.TODO || 0,
        inProgress: byStatus.IN_PROGRESS || 0,
        inReview: byStatus.IN_REVIEW || 0,
      },
      employees: {
        total: (byActive['true'] || 0) + (byActive['false'] || 0),
        active: byActive['true'] || 0,
      },
      inventory: { alerts: inventoryAlerts },
      finance: {
        revenue:  financeStats.find(f => f._id === 'INCOME')?.total  || 0,
        expenses: financeStats.find(f => f._id === 'EXPENSE')?.total || 0,
      },
      recentActivity,
    });
  } catch (err) {
    logger.error(`getDashboardOverview: ${err.message}`);
    throw err;
  }
};

const getWeeklyTaskData = async (req, res) => {
  const orgId = req.user.organizationId;
  const days = Math.min(parseInt(req.query.days || '7'), 30);
  try {
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const [completions, creations] = await Promise.all([
      Task.aggregate([
        { $match: { organizationId: orgId, status: 'DONE', updatedAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
            completed: { $sum: 1 },
          },
        },
      ]),
      Task.aggregate([
        { $match: { organizationId: orgId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            created: { $sum: 1 },
          },
        },
      ]),
    ]);

    const completedMap = completions.reduce((a, d) => { a[d._id] = d.completed; return a; }, {});
    const createdMap = creations.reduce((a, d) => { a[d._id] = d.created; return a; }, {});

    const result = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      result.push({
        date: key,
        label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
        completed: completedMap[key] || 0,
        created: createdMap[key] || 0,
      });
    }

    return success(res, { data: result });
  } catch (err) {
    logger.error(`getWeeklyTaskData: ${err.message}`);
    throw err;
  }
};

const getEmployeePerformance = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const data = await Task.aggregate([
      { $match: { organizationId: orgId, assigneeId: { $ne: null } } },
      {
        $group: {
          _id: '$assigneeId',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$status', 'DONE'] },
                    { $lt: ['$dueDate', new Date()] },
                    { $ne: ['$dueDate', null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 8 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      {
        $project: {
          name: { $ifNull: ['$user.name', '$user.phone'] },
          total: 1,
          completed: 1,
          overdue: 1,
          rate: {
            $cond: [
              { $gt: ['$total', 0] },
              { $round: [{ $multiply: [{ $divide: ['$completed', '$total'] }, 100] }, 0] },
              0,
            ],
          },
        },
      },
    ]);

    return success(res, { data });
  } catch (err) {
    logger.error(`getEmployeePerformance: ${err.message}`);
    throw err;
  }
};

module.exports = { getDashboardOverview, getWeeklyTaskData, getEmployeePerformance };
