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
const Invoice = require('../models/Invoice');
const { createNotification, bulkCreateNotifications } = require('./notification.service');
const { sendDailyReport, sendDailyReportWithPDF } = require('./whatsapp.service');
const {
  sendTaskOverdueEmployee, sendTaskOverdueManager, sendInProgressLeadUpdate, sendActiveClientStageUpdate,
  sendOverdueFollowUpRepAlert, sendStaleLeadManagerAlert, sendTasksDueTodaySummary, sendTeamTaskOverdueAlert,
} = require('./whatsappCloud.service');

// Individual DMs replace the old WhatsApp-group broadcast (Cloud API can't send to groups at all).
// Excludes user IDs already notified directly (e.g. the assignee/manager) to avoid duplicate pings.
async function notifyDepartmentMembers(organizationId, departmentName, excludeUserIds, sendFn, args) {
  const excluded = new Set((excludeUserIds || []).filter(Boolean).map(String));
  const members = await User.find({
    organizationId, department: departmentName, isActive: true,
    _id: { $nin: [...excluded] },
  }).select('phone whatsapp settings');
  await Promise.all(members.map((m) => {
    const waPhone = m.whatsapp || m.phone;
    if (!waPhone || m.settings?.notifications?.whatsapp === false) return null;
    return sendFn(waPhone, args).catch(() => {});
  }));
}
const { generateDailyReportPDF } = require('./reportPdf.service');
const { autoSyncAllOrgs } = require('./googleSheets.service');
const { TASK_STATUS, ROLES, ROLE_HIERARCHY, SOCKET_EVENTS } = require('../utils/constants');
const logger = require('../utils/logger');

let io;

const startAutomationEngine = (socketIo) => {
  io = socketIo;
  logger.info('Starting Backero automation engine...');

  // ── Keep Render alive 24/7: self-ping every 14 min (Render sleeps after 15 min idle) ──
  const keepAliveUrl = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL;
  if (keepAliveUrl) {
    const https = require('https');
    const http = require('http');
    cron.schedule('*/14 * * * *', () => {
      const url = `${keepAliveUrl}/health`;
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, (res) => {
        logger.info(`[KeepAlive] ping → ${res.statusCode}`);
      }).on('error', (err) => {
        logger.warn(`[KeepAlive] ping failed: ${err.message}`);
      });
    });
    logger.info(`[KeepAlive] Self-ping enabled → ${keepAliveUrl}/health every 14 min`);
  } else {
    logger.warn('[KeepAlive] RENDER_EXTERNAL_URL not set — add it in Render env vars to enable 24/7 uptime');
  }

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
    runOverdueFollowUpCheck().catch(logger.error);
  });

  // Every day at 2 PM IST: midday overdue follow-up check
  cron.schedule('30 8 * * *', () => {  // 2 PM IST = 8:30 AM UTC
    runOverdueFollowUpCheck().catch(logger.error);
  });

  // Every Monday at 9 AM IST: one consolidated low-stock digest to managers
  cron.schedule('30 3 * * 1', () => {  // 9 AM IST = 3:30 AM UTC
    runWeeklyStockDigest().catch(logger.error);
  });

  // 1st of every month at 9 AM IST: one consolidated low-stock digest to admins/founders
  cron.schedule('30 3 1 * *', () => {  // 9 AM IST = 3:30 AM UTC
    runMonthlyStockDigest().catch(logger.error);
  });

  // Every day at 10 AM IST: send daily stage updates to all active leads (Sample, In Progress, Ready to Dispatch, Payment Pending)
  cron.schedule('30 4 * * *', () => {  // 10 AM IST = 4:30 AM UTC
    runActiveClientUpdates().catch(logger.error);
  });

  // Every day at 9 AM IST: send due-today task reminders to department groups
  cron.schedule('30 3 * * *', () => {  // 9 AM IST = 3:30 AM UTC
    runDueTodayTaskReminder().catch(logger.error);
  });

  // Every 5 minutes: sync Google Sheets leads for all connected orgs
  cron.schedule('*/5 * * * *', () => {
    autoSyncAllOrgs().catch(logger.error);
  });

  // Every day at 8 AM IST: check overdue/due-soon invoices, alert Accounts & Finance
  cron.schedule('30 2 * * *', () => {  // 8 AM IST = 2:30 AM UTC
    runOverdueInvoiceCheck().catch(logger.error);
  });

  logger.info('Automation engine started successfully');
};

const runOverdueTaskCheck = async () => {
  logger.info('Running overdue task check...');
  const now = new Date();

  // ── Newly overdue tasks ────────────────────────────────────────────────────
  const overdueTasks = await Task.find({
    dueDate: { $lt: now },
    status: { $nin: [TASK_STATUS.COMPLETED, TASK_STATUS.ACHIEVED, TASK_STATUS.CANCELLED] },
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
          dueDate: task.dueDate, overdueCount: 1, taskId: task._id,
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
          taskId: task._id,
        });
      }
    }

    // 3. WhatsApp DM to the rest of the department team (individual sends — Cloud API can't message groups)
    await notifyDepartmentMembers(
      task.organizationId, task.department,
      [task.assignedTo?._id, task.assignedBy?._id],
      sendTeamTaskOverdueAlert,
      { department: task.department, title: task.title, employeeName, priority: task.priority, dueDate: task.dueDate },
    );

    // 4. WhatsApp to ALL admins/founders for every overdue task (skip assignedBy — they already got the manager message)
    await escalateToFounders(task, employeeName, task.assignedBy?._id);

    io?.to(`org:${task.organizationId}`).emit(SOCKET_EVENTS.OVERDUE_ALERT, { taskId: task._id, title: task.title });
  }

  // ── Already overdue — repeat reminders every 24h ───────────────────────────
  const alreadyOverdue = await Task.find({
    isOverdue: true,
    status: { $nin: [TASK_STATUS.COMPLETED, TASK_STATUS.ACHIEVED, TASK_STATUS.CANCELLED] },
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
          dueDate: task.dueDate, overdueCount: task.overdueNotificationsSent, taskId: task._id,
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
          taskId: task._id,
        });
      }
    }

    // Department team DM — every repeat reminder
    await notifyDepartmentMembers(
      task.organizationId, task.department,
      [task.assignedTo?._id, task.assignedBy?._id],
      sendTeamTaskOverdueAlert,
      { department: task.department, title: task.title, employeeName, priority: task.priority, dueDate: task.dueDate },
    );

    // Escalate to admins after 3 reminders (exclude assignedBy — already got manager message)
    if (isCritical) {
      await escalateToFounders(task, employeeName, task.assignedBy?._id);
    }
  }

  logger.info(`Overdue check: ${overdueTasks.length} new, ${alreadyOverdue.length} repeat`);
};

const escalateToFounders = async (task, employeeName = 'Team member', excludeId = null) => {
  const filter = {
    organizationId: task.organizationId,
    role: { $in: [ROLES.FOUNDER, ROLES.CHAIRMAN, ROLES.SUPER_ADMIN, ROLES.ADMIN] },
    isActive: true,
  };
  if (excludeId) filter._id = { $ne: excludeId };

  const admins = await User.find(filter).select('firstName lastName phone whatsapp');

  for (const admin of admins) {
    await createNotification({
      organizationId: task.organizationId,
      recipient: admin._id,
      title: '⚠️ Task Overdue Alert',
      message: `Task "${task.title}" (${task.department}) assigned to ${employeeName} is overdue.`,
      type: 'escalation', priority: 'high',
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
        taskId: task._id,
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
  }).populate('assignedTo', 'firstName lastName phone whatsapp')
    .populate('assignedBy', 'firstName lastName phone whatsapp');

  for (const lead of staleLeads) {
    lead.isStale = true;
    lead.followUpReminders = (lead.followUpReminders || 0) + 1;
    lead.lastReminderSent = new Date();
    await lead.save();

    const repName = lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : 'Team member';
    const daysStale = Math.floor((Date.now() - (lead.lastContactedAt || lead.createdAt)) / 86400000);

    // In-app + WhatsApp reminder to rep
    await createNotification({
      organizationId: lead.organizationId,
      recipient: lead.assignedTo._id,
      title: '⚠️ Lead Needs Follow-up',
      message: `Lead "${lead.name}" (${lead.phone}) hasn't been contacted in ${daysStale} day${daysStale !== 1 ? 's' : ''}.`,
      type: 'crm',
      priority: 'medium',
      actionUrl: `/crm/leads/${lead._id}`,
      reference: { model: 'Lead', id: lead._id },
      channels: { inApp: true, whatsapp: true },
    }, io);

    // From 2nd reminder: WhatsApp to manager
    if (lead.followUpReminders >= 2) {
      const managerSources = [];
      if (lead.assignedBy) managerSources.push(lead.assignedBy);
      else {
        const orgManagers = await User.find({
          organizationId: lead.organizationId,
          role: { $in: [ROLES.MANAGER, ROLES.ADMIN, ROLES.FOUNDER] },
          isActive: true,
        }).select('firstName lastName phone whatsapp _id').limit(3);
        managerSources.push(...orgManagers);
      }

      for (const mgr of managerSources) {
        await createNotification({
          organizationId: lead.organizationId,
          recipient: mgr._id,
          title: '🚨 Stale Lead — Action Required',
          message: `Lead "${lead.name}" assigned to ${repName} has not been followed up. Reminder #${lead.followUpReminders}.`,
          type: 'escalation',
          priority: lead.followUpReminders >= 3 ? 'critical' : 'high',
          actionUrl: `/crm/leads/${lead._id}`,
          reference: { model: 'Lead', id: lead._id },
          channels: { inApp: true, whatsapp: true },
        }, io);

        const mgrPhone = mgr.whatsapp || mgr.phone;
        if (mgrPhone) {
          await sendStaleLeadManagerAlert(mgrPhone, {
            leadName: lead.name, repName, daysStale, reminderCount: lead.followUpReminders,
          }).catch(() => {});
        }
      }
    }
  }

  logger.info(`Stale lead check: ${staleLeads.length} stale leads processed`);
};

const runOverdueFollowUpCheck = async () => {
  logger.info('[OverdueFollowUp] Checking overdue scheduled follow-ups...');
  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  const candidates = await Lead.find({
    status: { $nin: ['Payment Pending', 'Lost'] },
    assignedTo: { $ne: null },
    nextFollowUpAt: { $lt: now },
    $or: [{ lastReminderSent: null }, { lastReminderSent: { $lt: oneDayAgo } }],
  }).populate('assignedTo', 'firstName lastName phone whatsapp')
    .populate('assignedBy', 'firstName lastName phone whatsapp');

  // Filter: overdue only if not contacted after the scheduled follow-up date
  const overdueLeads = candidates.filter(lead =>
    !lead.lastContactedAt || lead.lastContactedAt < lead.nextFollowUpAt
  );

  let alerted = 0;
  for (const lead of overdueLeads) {
    const daysOverdue = Math.floor((now - lead.nextFollowUpAt) / 86400000) || 1;
    const repName = lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : 'Team member';

    lead.followUpReminders = (lead.followUpReminders || 0) + 1;
    lead.lastReminderSent = new Date();
    await lead.save();

    // In-app + WhatsApp to rep
    await createNotification({
      organizationId: lead.organizationId,
      recipient: lead.assignedTo._id,
      title: '📞 Follow-up Overdue',
      message: `Scheduled follow-up with "${lead.name}" is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue.`,
      type: 'crm',
      priority: daysOverdue >= 2 ? 'high' : 'medium',
      actionUrl: `/crm/leads/${lead._id}`,
      reference: { model: 'Lead', id: lead._id },
      channels: { inApp: true, whatsapp: true },
    }, io);

    const repPhone = lead.assignedTo.whatsapp || lead.assignedTo.phone;
    if (repPhone) {
      await sendOverdueFollowUpRepAlert(repPhone, {
        leadName: lead.name, leadPhone: lead.phone, daysOverdue,
      }).catch(() => {});
    }

    // Escalate to manager if overdue > 1 day
    if (daysOverdue >= 2) {
      const mgr = lead.assignedBy;
      const mgrList = mgr ? [mgr] : await User.find({
        organizationId: lead.organizationId,
        role: { $in: [ROLES.MANAGER, ROLES.ADMIN, ROLES.FOUNDER] },
        isActive: true,
      }).select('firstName lastName phone whatsapp _id').limit(2);

      for (const m of (Array.isArray(mgrList) ? mgrList : [mgrList])) {
        await createNotification({
          organizationId: lead.organizationId,
          recipient: m._id,
          title: '⚠️ Follow-up Escalation',
          message: `"${lead.name}" follow-up assigned to ${repName} is ${daysOverdue} days overdue.`,
          type: 'escalation',
          priority: 'high',
          actionUrl: `/crm/leads/${lead._id}`,
          reference: { model: 'Lead', id: lead._id },
          channels: { inApp: true, whatsapp: true },
        }, io);

        const mgrPhone = m.whatsapp || m.phone;
        if (mgrPhone) {
          await sendStaleLeadManagerAlert(mgrPhone, {
            leadName: lead.name, repName, daysStale: daysOverdue, reminderCount: lead.followUpReminders,
          }).catch(() => {});
        }
      }
    }

    alerted++;
  }

  logger.info(`[OverdueFollowUp] ${alerted} overdue follow-ups alerted`);
};

// Groups low-stock items (both raw materials and finished products live in the
// Product collection, split by isRawMaterial) into one readable digest body
// instead of pinging once per SKU.
const buildStockDigestMessage = (products) => {
  const line = (p) => `• ${p.name} (${p.sku}) — ${p.currentStock}/${p.minStockLevel} ${p.unit}${p.currentStock <= 0 ? ' ⚠️ OUT OF STOCK' : ''}`;
  const section = (label, list) => (list.length ? `${label} (${list.length}):\n${list.map(line).join('\n')}` : '');
  const materials = products.filter((p) => p.isRawMaterial);
  const goods = products.filter((p) => !p.isRawMaterial);
  return [section('📦 Raw Materials', materials), section('🏷️ Products', goods)].filter(Boolean).join('\n\n');
};

const groupByOrg = (products) => {
  const byOrg = {};
  for (const p of products) {
    const key = p.organizationId.toString();
    (byOrg[key] ||= []).push(p);
  }
  return byOrg;
};

const sendStockDigestToRoles = async (recipients, orgId, products, cadenceLabel) => {
  const message = buildStockDigestMessage(products);
  const title = `📦 ${cadenceLabel} Stock Digest — ${products.length} item${products.length !== 1 ? 's' : ''} low`;
  for (const user of recipients) {
    await createNotification({
      organizationId: orgId,
      recipient: user._id,
      title,
      message,
      type: 'inventory',
      priority: products.some((p) => p.currentStock <= 0) ? 'critical' : 'high',
      actionUrl: '/inventory/raw-materials',
      channels: { inApp: true, whatsapp: true },
    }, io);
  }
};

// Every Monday: one consolidated low-stock message to managers (no more per-SKU pings)
const runWeeklyStockDigest = async () => {
  const lowStock = await Product.find({
    isActive: true,
    enableMinStock: true,
    $expr: { $lte: ['$currentStock', '$minStockLevel'] },
  });
  if (!lowStock.length) return logger.info('[StockDigest] Weekly: nothing low, skipping');

  const byOrg = groupByOrg(lowStock);
  for (const [orgId, products] of Object.entries(byOrg)) {
    const managers = await User.find({ organizationId: orgId, role: ROLES.MANAGER, isActive: true });
    if (managers.length) await sendStockDigestToRoles(managers, orgId, products, 'Weekly');
  }
  logger.info(`[StockDigest] Weekly digest sent for ${Object.keys(byOrg).length} org(s)`);
};

// 1st of every month: one consolidated low-stock message to admins/founders
const runMonthlyStockDigest = async () => {
  const lowStock = await Product.find({
    isActive: true,
    enableMinStock: true,
    $expr: { $lte: ['$currentStock', '$minStockLevel'] },
  });
  if (!lowStock.length) return logger.info('[StockDigest] Monthly: nothing low, skipping');

  const byOrg = groupByOrg(lowStock);
  for (const [orgId, products] of Object.entries(byOrg)) {
    const admins = await User.find({
      organizationId: orgId,
      role: { $in: [ROLES.ADMIN, ROLES.FOUNDER, ROLES.CHAIRMAN, ROLES.SUPER_ADMIN] },
      isActive: true,
    });
    if (admins.length) await sendStockDigestToRoles(admins, orgId, products, 'Monthly');
  }
  logger.info(`[StockDigest] Monthly digest sent for ${Object.keys(byOrg).length} org(s)`);
};

const runOverdueInvoiceCheck = async () => {
  const now = new Date();

  // Flip sent/partially_paid invoices past their due date to 'overdue'
  const newlyOverdue = await Invoice.find({
    status: { $in: ['sent', 'partially_paid'] },
    dueDate: { $lt: now },
  });
  for (const inv of newlyOverdue) {
    inv.status = 'overdue';
    await inv.save();
  }

  // Alert Accounts & Finance for every currently-overdue invoice (repeats daily until paid)
  const overdueInvoices = await Invoice.find({ status: 'overdue' });
  for (const inv of overdueInvoices) {
    const daysOverdue = Math.max(1, Math.floor((now - inv.dueDate) / (1000 * 60 * 60 * 24)));
    const financeUsers = await User.find({
      organizationId: inv.organizationId,
      department: 'Accounts & Finance',
      isActive: true,
    });
    for (const u of financeUsers) {
      await createNotification({
        organizationId: inv.organizationId,
        recipient: u._id,
        title: '💰 Invoice Overdue',
        message: `Invoice ${inv.invoiceNumber} for ${inv.client?.name || 'client'} is ${daysOverdue} day(s) overdue. Balance: ₹${(inv.balanceAmount || 0).toLocaleString('en-IN')}`,
        type: 'finance', priority: 'high',
        actionUrl: `/finance/invoices/${inv._id}`,
        reference: { model: 'Invoice', id: inv._id },
        channels: { inApp: true, whatsapp: true },
      }, io);
    }
  }

  logger.info(`[OverdueInvoice] ${newlyOverdue.length} newly overdue, ${overdueInvoices.length} total alerted`);
};

const runActiveClientUpdates = async () => {
  logger.info('[ClientUpdates] Sending daily stage updates to all active leads...');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const ACTIVE_STAGES = ['Sample', 'In Progress', 'Ready to Dispatch', 'Payment Pending'];

  const leads = await Lead.find({
    status: { $in: ACTIVE_STAGES },
    $or: [{ whatsapp: { $exists: true, $ne: '' } }, { phone: { $exists: true, $ne: '' } }],
  });

  let sent = 0, skipped = 0;
  for (const lead of leads) {
    const phone = lead.whatsapp || lead.phone;
    if (!phone) continue;

    // Skip if a manual update was already sent to this lead today
    if (lead.lastUpdateAt && lead.lastUpdateAt >= todayStart) {
      skipped++;
      continue;
    }

    const lastUpdate = lead.lastUpdateText ||
      (lead.followUps?.length ? [...lead.followUps].reverse()[0]?.notes : null);

    await sendActiveClientStageUpdate(phone, { name: lead.name, stage: lead.status, lastUpdate });
    sent++;
  }

  logger.info(`[ClientUpdates] Daily updates: ${sent} sent, ${skipped} skipped (already updated today)`);
};

const runDueTodayTaskReminder = async () => {
  logger.info('[DueToday] Sending morning due-today reminders to department groups...');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const tasks = await Task.find({
    dueDate: { $gte: todayStart, $lte: todayEnd },
    status: { $nin: [TASK_STATUS.COMPLETED, TASK_STATUS.ACHIEVED, TASK_STATUS.CANCELLED] },
    isOverdue: false,
  })
    .populate('assignedTo', 'firstName lastName')
    .lean();

  if (tasks.length === 0) {
    logger.info('[DueToday] No tasks due today');
    return;
  }

  // Group by organizationId + department
  const byOrgDept = {};
  for (const task of tasks) {
    const key = `${task.organizationId}__${task.department}`;
    if (!byOrgDept[key]) byOrgDept[key] = { organizationId: task.organizationId, department: task.department, tasks: [] };
    byOrgDept[key].tasks.push(task);
  }

  let sent = 0;
  for (const { organizationId, department, tasks: deptTasks } of Object.values(byOrgDept)) {
    await notifyDepartmentMembers(
      organizationId, department, [],
      sendTasksDueTodaySummary,
      { department, count: deptTasks.length },
    );
    sent++;
  }

  logger.info(`[DueToday] Sent to ${sent} department(s), ${tasks.length} tasks total`);
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
      completedByEmployee,
      inProgressByEmployee,
      updatesByEmployee,
    ] = await Promise.all([
      safe(Task.countDocuments({ organizationId: org._id, status: 'Completed', completedAt: { $gte: today } })),
      safe(Task.countDocuments({ organizationId: org._id, dueDate: { $lt: new Date() }, status: { $nin: ['Completed', 'Achieved', 'Cancelled'] } })),
      safe(Task.countDocuments({ organizationId: org._id, status: 'Approval Pending' })),
      safe(Task.countDocuments({ organizationId: org._id, status: 'In Progress' })),
      safe(Task.countDocuments({ organizationId: org._id, status: { $nin: ['Completed', 'Achieved', 'Cancelled'] } })),
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
          overdue:      { $sum: { $cond: [{ $and: [{ $not: [{ $in: ['$status', ['Completed', 'Achieved', 'Cancelled']] }] }, { $lt: ['$dueDate', new Date()] }] }, 1, 0] } },
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
      // Who completed what today
      safe(Task.aggregate([
        { $match: { organizationId: org._id, status: 'Completed', completedAt: { $gte: today, $lte: todayEnd }, assignedTo: { $ne: null } } },
        { $group: { _id: '$assignedTo', titles: { $push: '$title' } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: { _id: 0, userId: '$_id', name: { $concat: ['$user.firstName', ' ', '$user.lastName'] }, department: '$user.department', titles: 1 } },
      ])),
      // What everyone is currently working on
      safe(Task.aggregate([
        { $match: { organizationId: org._id, status: 'In Progress', assignedTo: { $ne: null } } },
        { $group: { _id: '$assignedTo', titles: { $push: '$title' } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: { _id: 0, userId: '$_id', name: { $concat: ['$user.firstName', ' ', '$user.lastName'] }, department: '$user.department', titles: 1 } },
      ])),
      // Daily-update comments posted today, per author
      safe(Task.aggregate([
        { $match: { organizationId: org._id } },
        { $unwind: '$comments' },
        { $match: { 'comments.type': 'daily_update', 'comments.createdAt': { $gte: today, $lte: todayEnd } } },
        { $group: { _id: '$comments.author', count: { $sum: 1 } } },
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

    // Merge completed / in-progress / updates into one per-employee activity list
    const activityByUser = {};
    const getRow = (userId, name, department) => (activityByUser[userId] ||= { userId, name, department, completedTitles: [], inProgressTitles: [], updateCount: 0 });
    for (const row of (completedByEmployee || [])) getRow(row.userId, row.name, row.department).completedTitles = row.titles;
    for (const row of (inProgressByEmployee || [])) {
      const r = getRow(row.userId, row.name, row.department);
      r.inProgressTitles = row.titles;
      r.department = r.department || row.department;
    }
    for (const row of (updatesByEmployee || [])) {
      if (activityByUser[row._id]) activityByUser[row._id].updateCount = row.count;
    }
    const employeeActivity = Object.values(activityByUser)
      .sort((a, b) => (b.completedTitles.length - a.completedTitles.length) || (b.updateCount - a.updateCount))
      .slice(0, 15);

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
      employeeActivity,
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

module.exports = { startAutomationEngine, runOverdueTaskCheck, runWeeklyStockDigest, runMonthlyStockDigest, runOverdueInvoiceCheck, runDailyReport, runOverdueFollowUpCheck, runStaleLedCheck };
