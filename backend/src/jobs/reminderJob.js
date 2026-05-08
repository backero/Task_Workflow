const cron            = require('node-cron');
const Task            = require('../models/Task');
const Invoice         = require('../models/Invoice');
const User            = require('../models/User');
const Product         = require('../models/Product');
const ProductionOrder = require('../models/ProductionOrder');
const StockMovement   = require('../models/StockMovement');
const Organization    = require('../models/Organization');
const PDFDocument     = require('pdfkit');
const {
  sendTaskOverdue,
  sendInvoiceOverdue,
  sendDailyProductionReport,
} = require('../services/whatsapp.service');
const logger = require('../utils/logger');

/* ─────────────────────────────────────────────────────────────────────────────
   DAILY FULL ORG REPORT  (runs at 7 AM every day)
   Covers: Tasks · Production · Inventory · Finance
───────────────────────────────────────────────────────────────────────────── */

const buildOrgReport = async (orgId, dayStart, dayEnd, now) => {
  /* ── Tasks ── */
  const [
    taskTotal,
    taskDone,
    taskInProgress,
    taskTodo,
    taskOverdue,
    taskCreatedToday,
    taskCompletedToday,
    overdueTasks,
  ] = await Promise.all([
    Task.countDocuments({ organizationId: orgId }),
    Task.countDocuments({ organizationId: orgId, status: 'DONE' }),
    Task.countDocuments({ organizationId: orgId, status: 'IN_PROGRESS' }),
    Task.countDocuments({ organizationId: orgId, status: 'TODO' }),
    Task.countDocuments({ organizationId: orgId, dueDate: { $lt: now }, status: { $nin: ['DONE', 'CANCELLED'] } }),
    Task.countDocuments({ organizationId: orgId, createdAt: { $gte: dayStart, $lte: dayEnd } }),
    Task.countDocuments({ organizationId: orgId, status: 'DONE', updatedAt: { $gte: dayStart, $lte: dayEnd } }),
    Task.find({ organizationId: orgId, dueDate: { $lt: now }, status: { $nin: ['DONE', 'CANCELLED'] } })
      .populate('assigneeId', 'name').select('title dueDate status assigneeId').lean(),
  ]);

  /* ── Production ── */
  const [
    prodDraft,
    prodInProgress,
    prodCompletedToday,
    prodStartedToday,
    prodCancelledToday,
    activeOrders,
    completedOrders,
  ] = await Promise.all([
    ProductionOrder.countDocuments({ organizationId: orgId, status: 'draft' }),
    ProductionOrder.countDocuments({ organizationId: orgId, status: 'in_progress' }),
    ProductionOrder.countDocuments({ organizationId: orgId, status: 'completed', completedAt: { $gte: dayStart, $lte: dayEnd } }),
    ProductionOrder.countDocuments({ organizationId: orgId, startedAt: { $gte: dayStart, $lte: dayEnd } }),
    ProductionOrder.countDocuments({ organizationId: orgId, status: 'cancelled', updatedAt: { $gte: dayStart, $lte: dayEnd } }),
    ProductionOrder.find({ organizationId: orgId, status: 'in_progress' })
      .populate('outputProduct', 'name').select('orderNumber name outputQuantity outputUnit startedAt outputProduct').lean(),
    ProductionOrder.find({ organizationId: orgId, status: 'completed', completedAt: { $gte: dayStart, $lte: dayEnd } })
      .populate('outputProduct', 'name').select('orderNumber name outputQuantity outputUnit completedAt outputProduct').lean(),
  ]);

  /* ── Materials consumed today ── */
  const movements = await StockMovement.find({
    organizationId: orgId,
    createdAt: { $gte: dayStart, $lte: dayEnd },
    type: { $in: ['PRODUCTION_USE', 'IN'] },
  }).populate('productId', 'name unit').lean();

  const consumedMap = {};
  const stockInMap  = {};
  for (const mv of movements) {
    const key  = mv.productId?._id?.toString(); if (!key) continue;
    const name = mv.productId.name;
    const unit = mv.productId.unit || '';
    if (mv.type === 'PRODUCTION_USE') {
      consumedMap[key] = consumedMap[key] || { name, unit, qty: 0 };
      consumedMap[key].qty += mv.quantity;
    } else {
      stockInMap[key] = stockInMap[key] || { name, unit, qty: 0 };
      stockInMap[key].qty += mv.quantity;
    }
  }

  /* ── Inventory ── */
  const [totalProducts, lowStockItems] = await Promise.all([
    Product.countDocuments({ organizationId: orgId, isActive: true }),
    Product.find({ organizationId: orgId, isActive: true, $expr: { $lte: ['$quantity', '$minStockThreshold'] } })
      .select('name quantity minStockThreshold unit').lean(),
  ]);

  /* ── Finance ── */
  const [invoiceDraft, invoiceSent, invoicePaid, invoiceOverdue, paidTodayAgg] = await Promise.all([
    Invoice.countDocuments({ organizationId: orgId, status: 'DRAFT' }),
    Invoice.countDocuments({ organizationId: orgId, status: 'SENT' }),
    Invoice.countDocuments({ organizationId: orgId, status: 'PAID' }),
    Invoice.countDocuments({ organizationId: orgId, status: 'SENT', dueDate: { $lt: now } }),
    Invoice.aggregate([
      { $match: { organizationId: orgId, status: 'PAID', updatedAt: { $gte: dayStart, $lte: dayEnd } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
  ]);

  const paidToday      = paidTodayAgg[0] || { total: 0, count: 0 };
  const overdueInvoices = await Invoice.find({ organizationId: orgId, status: 'SENT', dueDate: { $lt: now } })
    .select('invoiceNumber customer totalAmount dueDate').lean();

  return {
    tasks: {
      total: taskTotal, done: taskDone, inProgress: taskInProgress,
      todo: taskTodo, overdue: taskOverdue,
      createdToday: taskCreatedToday, completedToday: taskCompletedToday,
      overdueList: overdueTasks.slice(0, 10),
    },
    production: {
      draft: prodDraft, inProgress: prodInProgress,
      startedToday: prodStartedToday, completedToday: prodCompletedToday, cancelledToday: prodCancelledToday,
      activeOrders, completedOrders,
      materialsConsumed: Object.values(consumedMap),
      stockReceived: Object.values(stockInMap),
    },
    inventory: {
      totalProducts, lowStockCount: lowStockItems.length, lowStockItems: lowStockItems.slice(0, 10),
    },
    finance: {
      draft: invoiceDraft, sent: invoiceSent, paid: invoicePaid, overdue: invoiceOverdue,
      paidTodayCount: paidToday.count,
      paidTodayAmount: paidToday.total,
      overdueInvoices: overdueInvoices.slice(0, 10),
    },
  };
};

/* ── Build WhatsApp text message ─────────────────────────────────────────── */

const buildTextReport = (orgName, dateLabel, r) => {
  const fmt = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
  let msg = `📊 *Daily Report — ${orgName}*\n📅 ${dateLabel}\n`;

  msg += `\n✅ *Tasks*\n`;
  msg += `• Total: ${r.tasks.total}  |  Done: ${r.tasks.done}  |  In Progress: ${r.tasks.inProgress}\n`;
  msg += `• Pending (TODO): ${r.tasks.todo}  |  Overdue: ${r.tasks.overdue}\n`;
  msg += `• Created today: ${r.tasks.createdToday}  |  Completed today: ${r.tasks.completedToday}\n`;
  if (r.tasks.overdueList.length) {
    msg += `⚠️ Overdue tasks:\n`;
    r.tasks.overdueList.forEach(t =>
      msg += `  – ${t.title} (${t.assigneeId?.name || 'Unassigned'}) due ${new Date(t.dueDate).toLocaleDateString('en-IN')}\n`
    );
  }

  msg += `\n🏭 *Production*\n`;
  msg += `• In Progress: ${r.production.inProgress}  |  Draft: ${r.production.draft}\n`;
  msg += `• Started today: ${r.production.startedToday}  |  Completed today: ${r.production.completedToday}\n`;
  if (r.production.activeOrders.length) {
    msg += `Active orders:\n`;
    r.production.activeOrders.forEach(o =>
      msg += `  – ${o.orderNumber}: ${o.name}\n`
    );
  }
  if (r.production.completedOrders.length) {
    msg += `Completed today:\n`;
    r.production.completedOrders.forEach(o =>
      msg += `  – ${o.orderNumber}: ${o.name} (${o.outputQuantity} ${o.outputUnit})\n`
    );
  }
  if (r.production.materialsConsumed.length) {
    msg += `Materials used: ` + r.production.materialsConsumed.map(m => `${m.name} ${m.qty} ${m.unit}`).join(', ') + `\n`;
  }
  if (r.production.stockReceived.length) {
    msg += `Stock received: ` + r.production.stockReceived.map(s => `${s.name} +${s.qty} ${s.unit}`).join(', ') + `\n`;
  }

  msg += `\n📦 *Inventory*\n`;
  msg += `• Total Products: ${r.inventory.totalProducts}  |  Low Stock: ${r.inventory.lowStockCount}\n`;
  if (r.inventory.lowStockItems.length) {
    msg += `Low stock alert:\n`;
    r.inventory.lowStockItems.forEach(p =>
      msg += `  – ${p.name}: ${p.quantity} ${p.unit} (min: ${p.minStockThreshold})\n`
    );
  }

  msg += `\n💰 *Finance*\n`;
  msg += `• Invoices — Draft: ${r.finance.draft}  Sent: ${r.finance.sent}  Paid: ${r.finance.paid}\n`;
  msg += `• Overdue invoices: ${r.finance.overdue}\n`;
  if (r.finance.paidTodayCount > 0) {
    msg += `• Payments received today: ${r.finance.paidTodayCount} invoice(s) — *${fmt(r.finance.paidTodayAmount)}*\n`;
  }
  if (r.finance.overdueInvoices.length) {
    msg += `Overdue:\n`;
    r.finance.overdueInvoices.forEach(inv =>
      msg += `  – ${inv.invoiceNumber}: ${inv.customer?.name || '—'} — ${fmt(inv.totalAmount)}\n`
    );
  }

  msg += `\n_(Full PDF report attached)_`;
  return msg;
};

/* ── Build PDF ───────────────────────────────────────────────────────────── */

const buildReportPDF = (orgName, dateLabel, r) => {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fmt   = (n) => `Rs.${Number(n).toLocaleString('en-IN')}`;
    const line  = () => { doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke(); doc.moveDown(0.4); };
    const h2    = (t) => { doc.moveDown(0.8).fontSize(13).font('Helvetica-Bold').fillColor('#111').text(t); line(); };
    const body  = (t) => doc.fontSize(10).font('Helvetica').fillColor('#333').text(t);
    const small = (t) => doc.fontSize(9).font('Helvetica').fillColor('#666').text(t);

    /* cover */
    doc.rect(0, 0, 595, 80).fill('#4f46e5');
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#fff').text('Daily Work Report', 50, 22, { align: 'center' });
    doc.fontSize(11).font('Helvetica').text(`${orgName}  ·  ${dateLabel}`, 50, 52, { align: 'center' });
    doc.moveDown(2);

    /* ── Tasks ── */
    h2('Tasks Overview');
    body(`Total Tasks: ${r.tasks.total}`);
    body(`Done: ${r.tasks.done}    In Progress: ${r.tasks.inProgress}    Pending (TODO): ${r.tasks.todo}`);
    body(`Overdue: ${r.tasks.overdue}    Created Today: ${r.tasks.createdToday}    Completed Today: ${r.tasks.completedToday}`);
    if (r.tasks.overdueList.length) {
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#dc2626').text('Overdue Tasks:');
      r.tasks.overdueList.forEach(t =>
        small(`  • ${t.title}  —  Assigned: ${t.assigneeId?.name || 'Unassigned'}  —  Due: ${new Date(t.dueDate).toLocaleDateString('en-IN')}`)
      );
    }

    /* ── Production ── */
    h2('Production');
    body(`In Progress: ${r.production.inProgress}    Draft: ${r.production.draft}`);
    body(`Started Today: ${r.production.startedToday}    Completed Today: ${r.production.completedToday}    Cancelled: ${r.production.cancelledToday}`);
    if (r.production.activeOrders.length) {
      doc.moveDown(0.4);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#b45309').text('Active Orders:');
      r.production.activeOrders.forEach(o =>
        small(`  • ${o.orderNumber}: ${o.name}  —  Target: ${o.outputQuantity} ${o.outputUnit}${o.outputProduct ? ' of ' + o.outputProduct.name : ''}`)
      );
    }
    if (r.production.completedOrders.length) {
      doc.moveDown(0.4);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#15803d').text('Completed Today:');
      r.production.completedOrders.forEach(o =>
        small(`  • ${o.orderNumber}: ${o.name}  —  Output: ${o.outputQuantity} ${o.outputUnit}`)
      );
    }
    if (r.production.materialsConsumed.length) {
      doc.moveDown(0.4);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333').text('Materials Consumed:');
      r.production.materialsConsumed.forEach(m =>
        small(`  • ${m.name}: ${m.qty} ${m.unit}`)
      );
    }
    if (r.production.stockReceived.length) {
      doc.moveDown(0.4);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333').text('Raw Materials Received:');
      r.production.stockReceived.forEach(s =>
        small(`  • ${s.name}: +${s.qty} ${s.unit}`)
      );
    }

    /* ── Inventory ── */
    h2('Inventory');
    body(`Total Products: ${r.inventory.totalProducts}    Low Stock Items: ${r.inventory.lowStockCount}`);
    if (r.inventory.lowStockItems.length) {
      doc.moveDown(0.4);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#dc2626').text('Low Stock Alert:');
      r.inventory.lowStockItems.forEach(p =>
        small(`  • ${p.name}: ${p.quantity} ${p.unit}  (Min threshold: ${p.minStockThreshold})`)
      );
    }

    /* ── Finance ── */
    h2('Finance & Invoices');
    body(`Invoices — Draft: ${r.finance.draft}    Sent/Pending: ${r.finance.sent}    Paid: ${r.finance.paid}`);
    body(`Overdue Invoices: ${r.finance.overdue}`);
    if (r.finance.paidTodayCount > 0) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#15803d')
        .text(`Payments Received Today: ${r.finance.paidTodayCount} invoice(s)  —  ${fmt(r.finance.paidTodayAmount)}`);
    }
    if (r.finance.overdueInvoices.length) {
      doc.moveDown(0.4);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#dc2626').text('Overdue Invoice Details:');
      r.finance.overdueInvoices.forEach(inv =>
        small(`  • ${inv.invoiceNumber}  —  ${inv.customer?.name || '—'}  —  ${fmt(inv.totalAmount)}  —  Due: ${new Date(inv.dueDate).toLocaleDateString('en-IN')}`)
      );
    }

    /* footer */
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').fillColor('#aaa')
      .text(`Generated by Backero  ·  ${new Date().toLocaleString('en-IN')}`, { align: 'center' });

    doc.end();
  });
};

/* ── Main daily report runner ────────────────────────────────────────────── */

const runDailyOrgReport = async () => {
  try {
    const now      = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(now); dayEnd.setHours(23, 59, 59, 999);
    const dateLabel = now.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

    // Find all active organizations
    const orgs = await Organization.find({ isActive: true }).select('_id name').lean();
    logger.info(`[DailyReport] Running for ${orgs.length} organization(s)`);

    for (const org of orgs) {
      try {
        const admins = await User.find({
          organizationId: org._id,
          role: { $in: ['SUPER_ADMIN', 'ORG_ADMIN', 'ADMIN'] },
          isActive: true,
          phone: { $ne: null },
        }).select('phone name').lean();

        if (!admins.length) continue;

        const r          = await buildOrgReport(org._id, dayStart, dayEnd, now);
        const textMsg    = buildTextReport(org.name, dateLabel, r);
        const pdfBuffer  = await buildReportPDF(org.name, dateLabel, r);

        logger.info(`[DailyReport] Sending to ${admins.length} admin(s) — org: ${org.name}`);

        for (const admin of admins) {
          await sendDailyProductionReport(admin.phone, admin.name, now.toISOString().split('T')[0], textMsg, pdfBuffer);
        }
      } catch (orgErr) {
        logger.error(`[DailyReport] Org ${org._id} error: ${orgErr.message}`);
      }
    }
  } catch (err) {
    logger.error(`[DailyReport] runDailyOrgReport error: ${err.message}`);
  }
};

/* ── Overdue task reminders ──────────────────────────────────────────────── */

const runTaskReminders = async () => {
  try {
    const now = new Date();
    const overdueTasks = await Task.find({
      dueDate: { $lt: now }, status: { $nin: ['DONE', 'CANCELLED'] }, assigneeId: { $ne: null },
    }).lean();
    if (!overdueTasks.length) return;
    logger.info(`[ReminderJob] Found ${overdueTasks.length} overdue task(s)`);
    const userIds = [...new Set(overdueTasks.map(t => t.assigneeId.toString()))];
    const users   = await User.find({ _id: { $in: userIds } }).select('_id phone name').lean();
    const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));
    for (const task of overdueTasks) {
      const assignee = userMap[task.assigneeId.toString()];
      if (!assignee?.phone) continue;
      sendTaskOverdue(assignee.phone, assignee.name, task.title, task.dueDate)
        .catch(err => logger.error(`[ReminderJob] Task WA error: ${err.message}`));
    }
  } catch (err) {
    logger.error(`[ReminderJob] runTaskReminders error: ${err.message}`);
  }
};

/* ── Overdue invoice reminders ───────────────────────────────────────────── */

const runInvoiceReminders = async () => {
  try {
    const now = new Date();
    const overdueInvoices = await Invoice.find({ dueDate: { $lt: now }, status: 'SENT' }).lean();
    if (!overdueInvoices.length) return;
    logger.info(`[ReminderJob] Found ${overdueInvoices.length} overdue invoice(s)`);
    for (const inv of overdueInvoices) {
      const phone = inv.customer?.phone; if (!phone) continue;
      sendInvoiceOverdue(phone, inv.customer.name, inv.invoiceNumber, inv.totalAmount, inv.dueDate)
        .catch(err => logger.error(`[ReminderJob] Invoice WA error: ${err.message}`));
    }
  } catch (err) {
    logger.error(`[ReminderJob] runInvoiceReminders error: ${err.message}`);
  }
};

/* ── Register cron schedules ─────────────────────────────────────────────── */

const startReminderJobs = () => {
  // 7 AM — full org daily report
  cron.schedule('0 7 * * *', () => {
    logger.info('[DailyReport] Sending daily organization report…');
    runDailyOrgReport();
  });

  // 9 AM — overdue task reminders
  cron.schedule('0 9 * * *', () => {
    logger.info('[ReminderJob] Running overdue task reminders…');
    runTaskReminders();
  });

  // 10 AM — overdue invoice reminders
  cron.schedule('0 10 * * *', () => {
    logger.info('[ReminderJob] Running overdue invoice reminders…');
    runInvoiceReminders();
  });

  logger.info('[ReminderJob] Scheduled: daily report @ 7 AM · task reminders @ 9 AM · invoice reminders @ 10 AM');
};

module.exports = { startReminderJobs, runDailyOrgReport };
