const Task = require('../models/Task');
const Lead = require('../models/Lead');
const Product = require('../models/Product');
const ProductionOrder = require('../models/ProductionOrder');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const TaskApproval = require('../models/TaskApproval');
const Notification = require('../models/Notification');
const ProductionQuery = require('../models/ProductionQuery');
const { asyncHandler, sendSuccess, getDateRange } = require('../utils/helpers');
const { TASK_STATUS, LEAD_STATUS, ROLES, ROLE_HIERARCHY } = require('../utils/constants');

// GET /api/dashboard/founder - Founder / Admin Command Center
exports.getFounderDashboard = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);

  const safe = (p) => p.catch(() => null);

  const [
    taskStats,
    overdueTaskCount,
    pendingApprovalsList,
    leadStats,
    lowStockCount,
    totalProducts,
    inventoryValue,
    activeProductionOrders,
    todayTransactions,
    monthTransactions,
    totalRevenue,
    departmentStats,
    topEmployees,
    recentAlerts,
    totalEmployees,
    monthlyRevenueTrend,
    recentTasks,
    recentQueries,
    pendingQueriesCount,
  ] = await Promise.all([
    safe(Task.aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])),
    safe(Task.countDocuments({ organizationId: orgId, isOverdue: true })),
    safe(TaskApproval.find({ organizationId: orgId, status: 'pending' })
      .populate('taskId', 'title department priority')
      .populate('requestedBy', 'firstName lastName')
      .sort({ requestedAt: -1 })
      .limit(8)),
    safe(Lead.aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])),
    safe(Product.countDocuments({ organizationId: orgId, isActive: true, $expr: { $lte: ['$currentStock', '$minStockLevel'] } })),
    safe(Product.countDocuments({ organizationId: orgId, isActive: true })),
    safe(Product.aggregate([
      { $match: { organizationId: orgId, isActive: true } },
      { $group: { _id: null, totalValue: { $sum: { $multiply: ['$currentStock', '$costPrice'] } }, totalStock: { $sum: '$currentStock' } } },
    ])),
    safe(ProductionOrder.countDocuments({ organizationId: orgId, status: { $in: ['In Production', 'Quality Check', 'Packaging'] } })),
    safe(Transaction.aggregate([
      { $match: { organizationId: orgId, date: { $gte: today, $lte: todayEnd } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ])),
    safe(Transaction.aggregate([
      { $match: { organizationId: orgId, date: { $gte: monthStart } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ])),
    safe(Transaction.aggregate([
      { $match: { organizationId: orgId, type: 'income' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ])),
    safe(Task.aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$department', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } }, overdue: { $sum: { $cond: ['$isOverdue', 1, 0] } }, inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } } } },
      { $addFields: { completionRate: { $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }] } } },
      { $sort: { total: -1 } },
    ])),
    safe(Task.aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$assignedTo', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } } } },
      { $sort: { completed: -1 } },
      { $limit: 6 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { userId: '$_id', firstName: '$user.firstName', lastName: '$user.lastName', department: '$user.department', role: '$user.role', total: 1, completed: 1, completionRate: { $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }] } } },
    ])),
    safe(Notification.find({ organizationId: orgId, recipient: req.user._id, isRead: false, priority: { $in: ['high', 'critical'] } })
      .sort({ createdAt: -1 })
      .limit(5)),
    safe(User.countDocuments({ organizationId: orgId, isActive: true })),
    safe(Transaction.aggregate([
      { $match: { organizationId: orgId, type: 'income', date: { $gte: sixMonthsAgo } } },
      { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' } }, total: { $sum: '$amount' } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ])),
    safe(Task.find({ organizationId: orgId })
      .populate('assignedTo', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(8)
      .select('title status priority department assignedTo dueDate isOverdue createdAt')),
    safe(ProductionQuery.find({ organizationId: orgId, status: 'pending' })
      .populate('raisedBy', 'firstName lastName')
      .populate('assignedTo', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(6)
      .select('title leadName urgency status raisedBy assignedTo createdAt')),
    safe(ProductionQuery.countDocuments({ organizationId: orgId, status: 'pending' })),
  ]);

  const statusMap = {};
  (taskStats || []).forEach((s) => { statusMap[s._id] = s.count; });
  const totalTasks = Object.values(statusMap).reduce((a, b) => a + b, 0);

  const leadMap = {};
  (leadStats || []).forEach((s) => { leadMap[s._id] = s.count; });
  const totalLeads = Object.values(leadMap).reduce((a, b) => a + b, 0);

  const incomeToday   = (todayTransactions || []).find((t) => t._id === 'income')?.total || 0;
  const expenseToday  = (todayTransactions || []).find((t) => t._id === 'expense')?.total || 0;
  const incomeMonth   = (monthTransactions || []).find((t) => t._id === 'income')?.total || 0;
  const expenseMonth  = (monthTransactions || []).find((t) => t._id === 'expense')?.total || 0;

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const revenueChart = (monthlyRevenueTrend || []).map((r) => ({
    month: MONTH_NAMES[r._id.month - 1],
    revenue: r.total,
  }));

  sendSuccess(res, {
    dashboard: {
      company: {
        totalTasks,
        completedTasks: statusMap['Completed'] || 0,
        inProgressTasks: statusMap['In Progress'] || 0,
        pendingTasks: (statusMap['Pending'] || 0) + (statusMap['Assigned'] || 0),
        approvalPendingTasks: statusMap['Approval Pending'] || 0,
        overdueTaskCount,
        pendingApprovalsCount: (pendingApprovalsList || []).length,
        completionRate: totalTasks > 0 ? Math.round(((statusMap['Completed'] || 0) / totalTasks) * 100) : 0,
        totalEmployees,
      },
      crm: {
        totalLeads,
        newLeads: leadMap['New Lead'] || 0,
        wonLeads: leadMap['Won'] || 0,
        lostLeads: leadMap['Lost'] || 0,
        followUp: leadMap['Follow-up'] || 0,
        interested: leadMap['Interested'] || 0,
        conversionRate: totalLeads > 0 ? Math.round(((leadMap['Won'] || 0) / totalLeads) * 100) : 0,
      },
      inventory: {
        totalProducts: totalProducts || 0,
        lowStockCount: lowStockCount || 0,
        totalStockValue: inventoryValue?.[0]?.totalValue || 0,
        totalStockUnits: inventoryValue?.[0]?.totalStock || 0,
      },
      production: { activeOrders: activeProductionOrders },
      finance: {
        todayIncome: incomeToday,
        todayExpense: expenseToday,
        todayNet: incomeToday - expenseToday,
        monthIncome: incomeMonth,
        monthExpense: expenseMonth,
        monthNet: incomeMonth - expenseMonth,
        totalRevenue: (totalRevenue || [])[0]?.total || 0,
        revenueChart,
      },
      departments: departmentStats || [],
      topEmployees: topEmployees || [],
      pendingApprovals: pendingApprovalsList || [],
      recentAlerts: recentAlerts || [],
      recentTasks: recentTasks || [],
      technicalQueries: {
        pendingCount: pendingQueriesCount || 0,
        recent: recentQueries || [],
      },
    },
  });
});

// GET /api/dashboard/employee
exports.getEmployeeDashboard = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const userId = req.user._id;

  const [myTasks, overdueTasks, completedThisMonth, myLeads, unreadNotifications, pendingApprovals, myQueries] = await Promise.all([
    Task.find({ organizationId: orgId, assignedTo: userId, status: { $nin: ['Completed', 'Cancelled'] } })
      .sort({ priority: -1, dueDate: 1 })
      .limit(10)
      .populate('assignedBy', 'firstName lastName'),
    Task.countDocuments({ organizationId: orgId, assignedTo: userId, isOverdue: true }),
    Task.countDocuments({
      organizationId: orgId,
      assignedTo: userId,
      status: 'Completed',
      completedAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    }),
    Lead.find({ organizationId: orgId, assignedTo: userId, status: { $nin: ['Won', 'Lost'] } })
      .sort({ nextFollowUpAt: 1 })
      .limit(5),
    Notification.countDocuments({ organizationId: orgId, recipient: userId, isRead: false }),
    TaskApproval.countDocuments({ organizationId: orgId, requestedBy: userId, status: 'pending' }),
    ProductionQuery.find({ organizationId: orgId, assignedTo: userId, status: 'pending' })
      .populate('raisedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title leadName urgency status raisedBy createdAt'),
  ]);

  sendSuccess(res, {
    dashboard: { myTasks, overdueTasks, completedThisMonth, myLeads, unreadNotifications, pendingApprovals, myQueries: myQueries || [] },
  });
});

// GET /api/dashboard/manager
exports.getManagerDashboard = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeDaysEnd = new Date(today);
  threeDaysEnd.setDate(threeDaysEnd.getDate() + 3);
  threeDaysEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const filter = { organizationId: orgId };
  if (req.user.department) filter.department = req.user.department;

  const safe = (p) => p.catch(() => null);

  const [
    taskStats,
    teamTasks,
    overdueCount,
    dueSoonTasks,
    completedThisMonth,
    pendingApprovals,
    teamPerformance,
    lowStockItems,
    teamSize,
    recentQueries,
    pendingQueriesCount,
  ] = await Promise.all([
    safe(Task.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }])),
    safe(Task.find({ ...filter, status: { $nin: ['Completed', 'Cancelled'] } })
      .populate('assignedTo', 'firstName lastName avatar')
      .sort({ dueDate: 1, priority: -1 })
      .limit(20)
      .select('title status priority department assignedTo dueDate isOverdue progress')),
    safe(Task.countDocuments({ ...filter, isOverdue: true })),
    safe(Task.find({ ...filter, status: { $nin: ['Completed', 'Cancelled'] }, dueDate: { $gte: today, $lte: threeDaysEnd } })
      .populate('assignedTo', 'firstName lastName')
      .sort({ dueDate: 1 })
      .limit(10)
      .select('title priority dueDate assignedTo department status')),
    safe(Task.countDocuments({ ...filter, status: 'Completed', completedAt: { $gte: monthStart } })),
    safe(TaskApproval.find({ organizationId: orgId, status: 'pending' })
      .populate('taskId', 'title department priority')
      .populate('requestedBy', 'firstName lastName')
      .sort({ requestedAt: -1 })
      .limit(10)),
    safe(Task.aggregate([
      { $match: filter },
      { $group: { _id: '$assignedTo', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } }, overdue: { $sum: { $cond: ['$isOverdue', 1, 0] } }, inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } } } },
      { $addFields: { completionRate: { $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }] } } },
      { $sort: { completed: -1 } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    ])),
    safe(Product.find({ organizationId: orgId, isActive: true, $expr: { $lte: ['$currentStock', '$minStockLevel'] } })
      .select('name sku currentStock minStockLevel unit category')
      .sort({ currentStock: 1 })
      .limit(8)),
    safe(req.user.department
      ? User.countDocuments({ organizationId: orgId, department: req.user.department, isActive: true })
      : User.countDocuments({ organizationId: orgId, isActive: true })),
    safe(ProductionQuery.find({ organizationId: orgId, status: 'pending' })
      .populate('raisedBy', 'firstName lastName')
      .populate('assignedTo', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(6)
      .select('title leadName urgency status raisedBy assignedTo createdAt')),
    safe(ProductionQuery.countDocuments({ organizationId: orgId, status: 'pending' })),
  ]);

  const statusMap = {};
  (taskStats || []).forEach((s) => { statusMap[s._id] = s.count; });
  const totalTasks = Object.values(statusMap).reduce((a, b) => a + b, 0);

  sendSuccess(res, {
    dashboard: {
      taskStats: taskStats || [],
      statusMap,
      totalTasks,
      teamTasks: teamTasks || [],
      overdueCount: overdueCount || 0,
      dueSoonTasks: dueSoonTasks || [],
      completedThisMonth: completedThisMonth || 0,
      pendingApprovals: pendingApprovals || [],
      teamPerformance: teamPerformance || [],
      lowStockItems: lowStockItems || [],
      teamSize: teamSize || 0,
      technicalQueries: {
        pendingCount: pendingQueriesCount || 0,
        recent: recentQueries || [],
      },
    },
  });
});

// GET /api/dashboard/department/:dept
exports.getDepartmentDashboard = asyncHandler(async (req, res) => {
  const { dept } = req.params;
  const orgId = req.user.organizationId;

  const [taskStats, recentTasks, employees, kpiData] = await Promise.all([
    Task.aggregate([
      { $match: { organizationId: orgId, department: dept } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.find({ organizationId: orgId, department: dept })
      .populate('assignedTo', 'firstName lastName avatar')
      .sort({ dueDate: 1 })
      .limit(10),
    User.find({ organizationId: orgId, department: dept, isActive: true })
      .select('firstName lastName avatar designation role lastActive'),
    Task.aggregate([
      { $match: { organizationId: orgId, department: dept, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  sendSuccess(res, { dashboard: { department: dept, taskStats, recentTasks, employees, kpiData } });
});
