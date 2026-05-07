const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { success } = require('../utils/response');
const logger = require('../utils/logger');

const getOverview = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const [taskStats, projectStats, memberCount] = await Promise.all([
      Task.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Project.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      User.countDocuments({ organizationId: orgId, isActive: true }),
    ]);

    const byStatus = taskStats.reduce((a, s) => { a[s._id] = s.count; return a; }, {});
    const byProjectStatus = projectStats.reduce((a, s) => { a[s._id] = s.count; return a; }, {});

    const totalTasks = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const doneTasks = byStatus.DONE || 0;
    const overdueTasks = await Task.countDocuments({
      organizationId: orgId,
      status: { $ne: 'DONE' },
      dueDate: { $lt: new Date() },
    });

    return success(res, {
      tasks: {
        total: totalTasks,
        todo: byStatus.TODO || 0,
        inProgress: byStatus.IN_PROGRESS || 0,
        inReview: byStatus.IN_REVIEW || 0,
        done: doneTasks,
        overdue: overdueTasks,
        completionRate: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      },
      projects: {
        total: Object.values(byProjectStatus).reduce((a, b) => a + b, 0),
        active: byProjectStatus.ACTIVE || 0,
        completed: byProjectStatus.COMPLETED || 0,
      },
      members: memberCount,
    });
  } catch (err) {
    logger.error(`getOverview: ${err.message}`);
    throw err;
  }
};

const getTaskAnalytics = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const [byPriority, byAssignee, overdueTasks] = await Promise.all([
      Task.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { organizationId: orgId, assigneeId: { $ne: null } } },
        { $group: { _id: '$assigneeId', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: { name: '$user.name', phone: '$user.phone', total: 1, done: 1 } },
      ]),
      Task.find({
        organizationId: orgId,
        status: { $ne: 'DONE' },
        dueDate: { $lt: new Date() },
      })
        .sort({ dueDate: 1 })
        .limit(10)
        .populate('assigneeId', 'name phone')
        .select('title dueDate priority status assigneeId projectId')
        .lean(),
    ]);

    const priorityMap = byPriority.reduce((a, s) => { a[s._id] = s.count; return a; }, {});

    return success(res, {
      byPriority: {
        LOW: priorityMap.LOW || 0,
        MEDIUM: priorityMap.MEDIUM || 0,
        HIGH: priorityMap.HIGH || 0,
        URGENT: priorityMap.URGENT || 0,
      },
      byAssignee,
      overdueTasks,
    });
  } catch (err) {
    logger.error(`getTaskAnalytics: ${err.message}`);
    throw err;
  }
};

const getProjectAnalytics = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const projects = await Project.find({ organizationId: orgId })
      .select('title color status taskCount completedTaskCount dueDate createdAt')
      .lean();

    const enriched = projects.map((p) => ({
      ...p,
      progress: p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0,
    }));

    return success(res, { projects: enriched });
  } catch (err) {
    logger.error(`getProjectAnalytics: ${err.message}`);
    throw err;
  }
};

const getActivity = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const { limit = 30 } = req.query;
    const logs = await ActivityLog.find({ organizationId: orgId })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('userId', 'name phone')
      .lean();
    return success(res, { logs });
  } catch (err) {
    logger.error(`getActivity: ${err.message}`);
    throw err;
  }
};

module.exports = { getOverview, getTaskAnalytics, getProjectAnalytics, getActivity };
