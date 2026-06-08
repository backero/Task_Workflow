const cron = require('node-cron');
const Task = require('../models/Task');
const Lead = require('../models/Lead');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Organization = require('../models/Organization');
const MarketplaceDaily = require('../models/MarketplaceDaily');
const MarketplacePlan = require('../models/MarketplacePlan');
const MarketplacePlanProgress = require('../models/MarketplacePlanProgress');
const { createNotification, bulkCreateNotifications } = require('./notification.service');
const { sendTaskOverdueEmployee, sendTaskOverdueManager, sendTaskOverdueGroup, sendDailyReport, sendDailyReportWithPDF } = require('./whatsapp.service');
const Department = require('../models/Department');
const { generateDailyReportPDF } = require('./reportPdf.service');
const { autoSyncAllOrgs } = require('./googleSheets.service');
const { TASK_STATUS, ROLES, ROLE_HIERARCHY, SOCKET_EVENTS } = require('../utils/constants');
const logger = require('../utils/logger');

let io;

const startAutomationEngine = (socketIo) => {
  io = socketIo;
  logger.info('Starting Backero automation engine...');

  // Every 30 minutes: check overdue tasks
  cron.schedule('*/30 * * * *', () => {
    runOverdueTaskCheck().catch(logger.error);
  });

  // Every hour: check stale leads (no follow-up in 2 days)
  cron.schedule('0 * * * *', () => {
    runStaleLedCheck().catch(logger.error);
  });

  // Every day at 9 PM IST: send daily report to all admins
  cron.schedule('30 15 * * *', () => {  // 9 PM IST = 15:30 UTC
    runDailyReport().catch(logger.error);
  });

  // Every day at 8 AM IST: send follow-up reminders
  cron.schedule('30 2 * * *', () => {  // 8 AM IST = 2:30 AM UTC
    runFollowUpReminders().catch(logger.error);
  });

  // Low stock check every 6 hours
  cron.schedule('0 */6 * * *', () => {
    runLowStockCheck().catch(logger.error);
  });

  // Weekly report every Monday at 9 AM IST
  cron.schedule('30 3 * * 1', () => {
    runWeeklyReport().catch(logger.error);
  });

  // Every 5 minutes: sync Google Sheets leads for all connected orgs
  cron.schedule('*/5 * * * *', () => {
    autoSyncAllOrgs().catch(logger.error);
  });

  logger.info('Automation engine started successfully');
};

const runOverdueTaskCheck = async () => {
  logger.info('Running overdue task check...');
  const now = new Date();

  // ── Newly overdue tasks ────────────────────────────────────────────────────
  const overdueTasks = await Task.find({
    dueDate: { $lt: now },
    status: { $nin: [TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED] },
    isOverdue: false,
  })
    .populate('assignedTo', 'firstName lastName phone whatsapp role department')
    .populate('assignedBy', 'firstName lastName phone whatsapp');

  for (const task of overdueTasks) {
    task.isOverdue = true;
    task.overdueNotificationsSent = 1;
    task.lastReminderSent = new Date();
    await task.save();

    const employeeName = task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : 'Unknown';
    const assignedByName = task.assignedBy ? `${task.assignedBy.firstName} ${task.assignedBy.lastName}` : '—';

    // 1. In-app + WhatsApp to employee
    if (task.assignedTo) {
      await createNotification({
        organizationId: task.organizationId,
        recipient: task.assignedTo._id,
        title: '⚠️ Task Overdue',
        message: `Your task "${task.title}" is overdue. Please update immediately.`,
        type: 'task', priority: 'high',
        actionUrl: `/tasks/${task._id}`,
        reference: { model: 'Task', id: task._id },
        channels: { inApp: true, whatsapp: false },
      }, io);

      // Direct WhatsApp to employee
      const empPhone = task.assignedTo.whatsapp || task.assignedTo.phone;
      if (empPhone) {
        await sendTaskOverdueEmployee(empPhone, {
          title: task.title, assignedByName,
          dueDate: task.dueDate, overdueCount: 1,
        });
      }
    }

    // 2. In-app to manager (assignedBy)
    if (task.assignedBy && task.assignedBy._id?.toString() !== task.assignedTo?._id?.toString()) {
      await createNotification({
        organizationId: task.organizationId,
        recipient: task.assignedBy._id,
        title: '⚠️ Team Task Overdue',
        message: `"${task.title}" assigned to ${employeeName} is now overdue.`,
        type: 'escalation', priority: 'high',
        actionUrl: `/tasks/${task._id}`,
        reference: { model: 'Task', id: task._id },
        channels: { inApp: true, whatsapp: false },
      }, io);

      // Direct WhatsApp to manager
      const mgrPhone = task.assignedBy.whatsapp || task.assignedBy.phone;
      if (mgrPhone) {
        await sendTaskOverdueManager(mgrPhone, {
          title: task.title, employeeName,
          department: task.department, dueDate: task.dueDate, priority: task.priority,
        });
      }
    }

    // 3. WhatsApp to department group
    const deptDoc = await Department.findOne({
      organizationId: task.organizationId,
      $or: [{ name: task.department }, { code: task.department }],
    }).select('whatsappGroupId');
    if (deptDoc?.whatsappGroupId) {
      await sendTaskOverdueGroup(deptDoc.whatsappGroupId, {
        title: task.title, employeeName,
        department: task.department, dueDate: task.dueDate,
        priority: task.priority, overdueCount: 1, taskId: task._id,
      });
    }

    // 4. WhatsApp to ALL admins/founders for critical/urgent tasks
    if (task.priority === 'critical' || task.priority === 'urgent') {
      await escalateToFounders(task, employeeName);
    }

    io?.to(`org:${task.organizationId}`).emit(SOCKET_EVENTS.OVERDUE_ALERT, { taskId: task._id, title: task.title });
  }

  // ── Already overdue — repeat reminders every 24h ───────────────────────────
  const alreadyOverdue = await Task.find({
    isOverdue: true,
    status: { $nin: [TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED] },
    lastReminderSent: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  })
    .populate('assignedTo', 'firstName lastName phone whatsapp')
    .populate('assignedBy', 'firstName lastName phone whatsapp');

  for (const task of alreadyOverdue) {
    task.overdueNotificationsSent = (task.overdueNotificationsSent || 0) + 1;
    task.lastReminderSent = new Date();
    await task.save();

    const isCritical = task.overdueNotificationsSent >= 3;
    const employeeName = task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : 'Unknown';
    const assignedByName = task.assignedBy ? `${task.assignedBy.firstName} ${task.assignedBy.lastName}` : '—';

    if (task.assignedTo) {
      await createNotification({
        organizationId: task.organizationId,
        recipient: task.assignedTo._id,
        title: '🚨 Task Still Overdue',
        message: `"${task.title}" remains overdue (reminder #${task.overdueNotificationsSent}).`,
        type: 'escalation',
        priority: isCritical ? 'critical' : 'high',
        actionUrl: `/tasks/${task._id}`,
        reference: { model: 'Task', id: task._id },
        channels: { inApp: true, whatsapp: false },
      }, io);

      // WhatsApp every repeat
      const empPhone = task.assignedTo.whatsapp || task.assignedTo.phone;
      if (empPhone) {
        await sendTaskOverdueEmployee(empPhone, {
          title: task.title, assignedByName,
          dueDate: task.dueDate, overdueCount: task.overdueNotificationsSent,
        });
      }
    }

    // Manager WhatsApp on every 2nd+ reminder
    if (task.assignedBy && task.overdueNotificationsSent >= 2) {
      const mgrPhone = task.assignedBy.whatsapp || task.assignedBy.phone;
      if (mgrPhone) {
        await sendTaskOverdueManager(mgrPhone, {
          title: task.title, employeeName,
          department: task.department, dueDate: task.dueDate, priority: task.priority,
        });
      }
    }

    // Department group — every repeat reminder
    const deptDoc2 = await Department.findOne({
      organizationId: task.organizationId,
      $or: [{ name: task.department }, { code: task.department }],
    }).select('whatsappGroupId');
    if (deptDoc2?.whatsappGroupId) {
      await sendTaskOverdueGroup(deptDoc2.whatsappGroupId, {
        title: task.title, employeeName,
        department: task.department, dueDate: task.dueDate,
        priority: task.priority, overdueCount: task.overdueNotificationsSent, taskId: task._id,
      });
    }

    // Escalate to admins after 3 reminders
    if (isCritical) {
      await escalateToFounders(task, employeeName);
    }
  }

  logger.info(`Overdue check: ${overdueTasks.length} new, ${alreadyOverdue.length} repeat`);
};

const escalateToFounders = async (task, employeeName = 'Team member') => {
  const admins = await User.find({
    organizationId: task.organizationId,
    role: { $in: [ROLES.FOUNDER, ROLES.CHAIRMAN, ROLES.SUPER_ADMIN, ROLES.ADMIN] },
    isActive: true,
  }).select('firstName lastName phone whatsapp');

  for (const admin of admins) {
    await createNotification({
      organizationId: task.organizationId,
      recipient: admin._id,
      title: '🚨 ESCALATION: Critical Task Overdue',
      message: `Task "${task.title}" (${task.department}) assigned to ${employeeName} has been overdue for extended period.`,
      type: 'escalation', priority: 'critical',
      actionUrl: `/tasks/${task._id}`,
      reference: { model: 'Task', id: task._id },
      channels: { inApp: true, whatsapp: false },
    }, io);

    // Direct WhatsApp to admin
    const adminPhone = admin.whatsapp || admin.phone;
    if (adminPhone) {
      await sendTaskOverdueManager(adminPhone, {
        title: task.title, employeeName,
        department: task.department, dueDate: task.dueDate, priority: task.priority,
      });
    }
  }
};

const runStaleLedCheck = async () => {
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const staleLeads = await Lead.find({
    status: { $nin: ['Payment Pending', 'Lost'] },
    assignedTo: { $ne: null },
    $or: [
      { lastContactedAt: { $lt: twoDaysAgo } },
      { lastContactedAt: null, createdAt: { $lt: twoDaysAgo } },
    ],
    isStale: false,
  });

  for (const lead of staleLeads) {
    lead.isStale = true;
    lead.followUpReminders = (lead.followUpReminders || 0) + 1;
    lead.lastReminderSent = new Date();
    await lead.save();

    await createNotification({
      organizationId: lead.organizationId,
      recipient: lead.assignedTo,
      title: 'Lead Needs Follow-up',
      message: `Lead "${lead.name}" (${lead.phone}) hasn't been contacted in 48 hours.`,
      type: 'crm',
      priority: 'medium',
      actionUrl: `/crm/leads/${lead._id}`,
      reference: { model: 'Lead', id: lead._id },
      channels: { inApp: true, whatsapp: true },
    }, io);

    // Escalate if ignored 3+ times
    if (lead.followUpReminders >= 3 && lead.priority === 'high') {
      const managers = await User.find({
        organizationId: lead.organizationId,
        role: { $in: [ROLES.MANAGER, ROLES.ADMIN, ROLES.FOUNDER] },
      });
      for (const mgr of managers) {
        await createNotification({
          organizationId: lead.organizationId,
          recipient: mgr._id,
          title: '⚠️ High-Value Lead Ignored',
          message: `High-value lead "${lead.name}" has not been followed up after ${lead.followUpReminders} reminders.`,
          type: 'escalation',
          priority: 'high',
          actionUrl: `/crm/leads/${lead._id}`,
          reference: { model: 'Lead', id: lead._id },
          channels: { inApp: true, whatsapp: true },
        }, io);
      }
    }
  }

  logger.info(`Stale lead check: ${staleLeads.length} stale leads processed`);
};

const runLowStockCheck = async () => {
  const lowStockProducts = await Product.find({
    isActive: true,
    $expr: { $lte: ['$currentStock', '$minStockLevel'] },
  });

  for (const product of lowStockProducts) {
    const admins = await User.find({
      organizationId: product.organizationId,
      role: { $in: [ROLES.ADMIN, ROLES.MANAGER, ROLES.FOUNDER] },
      isActive: true,
    });

    for (const admin of admins) {
      await createNotification({
        organizationId: product.organizationId,
        recipient: admin._id,
        title: '📦 Low Stock Alert',
        message: `${product.name} (SKU: ${product.sku}) is running low. Current: ${product.currentStock} ${product.unit}, Min: ${product.minStockLevel} ${product.unit}`,
        type: 'inventory',
        priority: product.currentStock === 0 ? 'critical' : 'high',
        actionUrl: `/inventory/products/${product._id}`,
        reference: { model: 'Product', id: product._id },
        channels: { inApp: true, whatsapp: product.currentStock === 0 },
      }, io);
    }

    io?.to(`org:${product.organizationId}`).emit(SOCKET_EVENTS.INVENTORY_LOW, { product });
  }

  logger.info(`Low stock check: ${lowStockProducts.length} products below minimum`);
};

const runFollowUpReminders = async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  const dueFollowUps = await Lead.find({
    status: { $nin: ['Payment Pending', 'Lost'] },
    assignedTo: { $ne: null },
    nextFollowUpAt: { $gte: new Date(), $lte: tomorrow },
  }).populate('assignedTo', 'firstName lastName');

  for (const lead of dueFollowUps) {
    await createNotification({
      organizationId: lead.organizationId,
      recipient: lead.assignedTo._id,
      title: '📞 Follow-up Reminder',
      message: `Follow up with "${lead.name}" (${lead.phone}) is scheduled soon.`,
      type: 'crm',
      priority: 'medium',
      actionUrl: `/crm/leads/${lead._id}`,
      reference: { model: 'Lead', id: lead._id },
      channels: { inApp: true, whatsapp: true },
    }, io);
  }

  logger.info(`Follow-up reminders sent for ${dueFollowUps.length} leads`);
};

const runDailyReport = async (targetPhones = null) => {
  logger.info('Generating 9 PM daily reports...');
  const orgs = await Organization.find({ isActive: true });

  for (const org of orgs) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const safe = (p) => p.catch(() => null);

    const [
      tasksCompleted,
      tasksOverdue,
      tasksPendingApproval,
      tasksInProgress,
      totalTasks,
      newLeadsToday,
      leadsWonToday,
      activeLeads,
      todayIncome,
      todayExpense,
      lowStockCount,
      activeProductionOrders,
      topPerformer,
      departmentStats,
      marketplaceToday,
      platformListings,
      marketplacePlans,
      platformProgress,
    ] = await Promise.all([
      safe(Task.countDocuments({ organizationId: org._id, status: 'Completed', completedAt: { $gte: today } })),
      safe(Task.countDocuments({ organizationId: org._id, isOverdue: true })),
      safe(Task.countDocuments({ organizationId: org._id, status: 'Approval Pending' })),
      safe(Task.countDocuments({ organizationId: org._id, status: 'In Progress' })),
      safe(Task.countDocuments({ organizationId: org._id, status: { $nin: ['Completed', 'Cancelled'] } })),
      safe(require('../models/Lead').countDocuments({ organizationId: org._id, createdAt: { $gte: today, $lte: todayEnd } })),
      safe(require('../models/Lead').countDocuments({ organizationId: org._id, status: 'Payment Pending', updatedAt: { $gte: today } })),
      safe(require('../models/Lead').countDocuments({ organizationId: org._id, status: { $nin: ['Payment Pending', 'Lost'] } })),
      safe(Transaction.aggregate([
        { $match: { organizationId: org._id, type: 'income', date: { $gte: today, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])),
      safe(Transaction.aggregate([
        { $match: { organizationId: org._id, type: 'expense', date: { $gte: today, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])),
      safe(Product.countDocuments({ organizationId: org._id, isActive: true, $expr: { $lte: ['$currentStock', '$minStockLevel'] } })),
      safe(require('../models/ProductionOrder').countDocuments({ organizationId: org._id, status: { $in: ['In Production', 'Quality Check', 'Packaging'] } })),
      safe(Task.aggregate([
        { $match: { organizationId: org._id, status: 'Completed', completedAt: { $gte: today } } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      ])),
      // Department-wise breakdown: total, by-status counts, subtask count, nearest due date
      safe(Task.aggregate([
        { $match: { organizationId: org._id, status: { $nin: ['Cancelled'] } } },
        { $group: {
          _id: '$department',
          total:        { $sum: 1 },
          completed:    { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          inProgress:   { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          overdue:      { $sum: { $cond: ['$isOverdue', 1, 0] } },
          pending:      { $sum: { $cond: [{ $in: ['$status', ['Pending', 'Assigned']] }, 1, 0] } },
          subtaskCount: { $sum: { $size: { $ifNull: ['$subTasks', []] } } },
          nearestDue:   { $min: '$dueDate' },
        }},
        { $addFields: { department: '$_id' } },
        { $sort: { department: 1 } },
      ])),
      // Today's marketplace aggregate
      safe(MarketplaceDaily.findOne({ organizationId: org._id, date: { $gte: today, $lte: todayEnd } }).lean()),
      // Active product listings per platform
      safe(Product.aggregate([
        { $match: { organizationId: org._id, isActive: true, 'marketplaceListings.0': { $exists: true } } },
        { $unwind: '$marketplaceListings' },
        { $match: { 'marketplaceListings.isActive': true } },
        { $group: { _id: '$marketplaceListings.platform', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])),
      // Marketplace plans (all platforms)
      safe(MarketplacePlan.find({ organizationId: org._id }).lean()),
      // Latest progress per platform (highest week with data)
      safe(MarketplacePlanProgress.aggregate([
        { $match: { organizationId: org._id } },
        { $sort: { week: -1 } },
        { $group: { _id: '$platform', latestDoc: { $first: '$$ROOT' } } },
      ])),
    ]);

    const topP = (topPerformer || [])[0];
    const topPerformerName = topP?.user ? `${topP.user.firstName} ${topP.user.lastName}` : null;
    const reportDate = today.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayDayKey = dayNames[today.getDay()];
    const progressByPlatform = {};
    for (const p of (platformProgress || [])) progressByPlatform[p._id] = p.latestDoc;

    const platformPlanSummary = (marketplacePlans || []).map((plan) => {
      const prog = progressByPlatform[plan.platform];
      const currentWeekNum = prog ? prog.week : (plan.weeks.length > 0 ? 1 : null);
      const weekData = plan.weeks.find((w) => w.week === currentWeekNum) || plan.weeks[0] || null;
      const todayTasks = weekData?.specific?.[todayDayKey] || [];
      const checkedIds = prog?.days?.[todayDayKey]?.checked || [];
      return {
        platform: plan.platform,
        currentWeek: currentWeekNum,
        weekName: weekData?.name || '',
        focus: weekData?.focus || '',
        mustNonNeg: weekData?.mustNonNeg || '',
        totalWeeks: plan.weeks.length,
        todayTasks,
        checkedCount: checkedIds.length,
        totalTodayTasks: todayTasks.length,
      };
    });

    const reportData = {
      orgName: org.name,
      date: reportDate,
      tasksCompleted: tasksCompleted || 0,
      tasksOverdue: tasksOverdue || 0,
      tasksPendingApproval: tasksPendingApproval || 0,
      tasksInProgress: tasksInProgress || 0,
      totalTasks: totalTasks || 0,
      newLeadsToday: newLeadsToday || 0,
      leadsWonToday: leadsWonToday || 0,
      activeLeads: activeLeads || 0,
      incomeToday: (todayIncome || [])[0]?.total || 0,
      expenseToday: (todayExpense || [])[0]?.total || 0,
      lowStockCount: lowStockCount || 0,
      activeProductionOrders: activeProductionOrders || 0,
      topPerformerName,
      topPerformerCount: topP?.count || 0,
      departmentStats: departmentStats || [],
      marketplaceToday: marketplaceToday || null,
      platformListings: platformListings || [],
      platformPlanSummary,
    };

    // Generate PDF (best-effort — don't block sending if PDF fails)
    let pdfResult = null;
    try {
      pdfResult = await generateDailyReportPDF(reportData);
      logger.info(`Daily report PDF saved: ${pdfResult.fileName}`);
    } catch (pdfErr) {
      logger.error(`PDF generation failed: ${pdfErr.message}`);
    }

    if (targetPhones && targetPhones.length > 0) {
      for (const phone of targetPhones) {
        await sendDailyReport(phone, reportData);
        if (pdfResult) await sendDailyReportWithPDF(phone, pdfResult.buffer, pdfResult.fileName).catch(() => {});
      }
    } else {
      const admins = await User.find({
        organizationId: org._id,
        role: { $in: [ROLES.SUPER_ADMIN, ROLES.CHAIRMAN, ROLES.FOUNDER, ROLES.ADMIN] },
        isActive: true,
      }).select('firstName lastName phone whatsapp');

      const summaryMsg = `Daily Report: ${tasksCompleted || 0} completed, ${tasksOverdue || 0} overdue, ₹${(reportData.incomeToday || 0).toLocaleString('en-IN')} income today.`;

      for (const admin of admins) {
        await createNotification({
          organizationId: org._id,
          recipient: admin._id,
          title: `📊 Daily Report — ${reportDate}`,
          message: summaryMsg,
          type: 'system',
          priority: (tasksOverdue || 0) > 5 ? 'high' : 'medium',
          actionUrl: '/dashboard/founder',
          channels: { inApp: true, whatsapp: false },
        }, io);

        const adminPhone = admin.whatsapp || admin.phone;
        if (adminPhone) {
          await sendDailyReport(adminPhone, reportData);
          if (pdfResult) await sendDailyReportWithPDF(adminPhone, pdfResult.buffer, pdfResult.fileName).catch(() => {});
        }
      }
    }

    logger.info(`Daily report sent for org: ${org.name}`);
  }
};

const runWeeklyReport = async () => {
  logger.info('Generating weekly reports...');
  // Weekly report generation - summarized for each org
};

module.exports = { startAutomationEngine, runOverdueTaskCheck, runLowStockCheck, runDailyReport };
