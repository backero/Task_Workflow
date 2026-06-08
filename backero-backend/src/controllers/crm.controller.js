const Lead = require('../models/Lead');
const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { LEAD_STATUS, SOCKET_EVENTS, ROLE_HIERARCHY, ROLES } = require('../utils/constants');
const { createNotification } = require('../services/notification.service');
const { appendLeadToSheet, updateLeadInSheet } = require('../services/googleSheets.service');
const { sendNewLeadAlert } = require('../services/whatsapp.service');

// GET /api/crm/leads
exports.getLeads = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, source, assignedTo, search, priority, dateFrom, dateTo, isStale, followUpOnly } = req.query;
  const { skip } = paginate(page, limit);

  const filter = { organizationId: req.user.organizationId };

  if (req.user.role === ROLES.MEMBER) filter.assignedTo = req.user._id;
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (priority) filter.priority = priority;
  if (isStale === 'true') filter.isStale = true;
  if (followUpOnly === 'true') filter.nextFollowUpAt = { $exists: true, $ne: null };
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }
  if (search) {
    const esc = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: esc, $options: 'i' } },
      { phone: { $regex: esc, $options: 'i' } },
      { email: { $regex: esc, $options: 'i' } },
      { company: { $regex: esc, $options: 'i' } },
    ];
  }

  const sortOrder = followUpOnly === 'true'
    ? { nextFollowUpAt: 1 }
    : { priority: -1, nextFollowUpAt: 1, createdAt: -1 };

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .populate('assignedTo', 'firstName lastName avatar')
      .populate('assignedBy', 'firstName lastName')
      .sort(sortOrder)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Lead.countDocuments(filter),
  ]);

  sendSuccess(res, paginateResponse(leads, total, page, limit));
});

// POST /api/crm/leads
exports.createLead = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { name, email, phone, whatsapp, company, source, status, priority, productInterest, estimatedValue, assignedTo, notes, campaign, city, state, designation } = req.body;

  // Check duplicate by phone in org
  const existing = await Lead.findOne({ organizationId: req.user.organizationId, phone });
  if (existing) return sendError(res, `Lead with phone ${phone} already exists.`, 409);

  const lead = await Lead.create({
    organizationId: req.user.organizationId,
    name, email, phone, whatsapp, company, source, status: status || LEAD_STATUS.NEW, priority, productInterest, estimatedValue,
    assignedTo, notes, campaign, city, state, designation,
    assignedBy: assignedTo ? req.user._id : undefined,
    assignedAt: assignedTo ? new Date() : undefined,
    createdBy: req.user._id,
  });

  if (assignedTo) {
    await createNotification({
      organizationId: req.user.organizationId,
      recipient: assignedTo,
      title: 'New Lead Assigned',
      message: `Lead "${name}" (${phone}) has been assigned to you`,
      type: 'crm',
      priority: priority === 'critical' ? 'high' : 'medium',
      actionUrl: `/crm/leads/${lead._id}`,
      reference: { model: 'Lead', id: lead._id },
      channels: { inApp: true, whatsapp: true },
    }, io);

    io?.to(`user:${assignedTo}`).emit(SOCKET_EVENTS.LEAD_ASSIGNED, { lead });
  }

  await ActivityLog.create({
    organizationId: req.user.organizationId,
    performedBy: req.user._id,
    action: 'lead_created',
    module: 'crm',
    reference: { model: 'Lead', id: lead._id, title: name },
  });

  // Notify CRM WhatsApp group (async, non-blocking)
  Organization.findById(req.user.organizationId).select('googleSheets crmLeadGroupId').then((org) => {
    if (org?.crmLeadGroupId) {
      const createdByName = `${req.user.firstName} ${req.user.lastName}`.trim();
      sendNewLeadAlert(org.crmLeadGroupId, { ...lead, createdByName }).catch(() => {});
    }
    if (org?.googleSheets?.writeBackEnabled && org?.googleSheets?.sheetId) {
      appendLeadToSheet(org, lead).catch(() => {});
    }
  }).catch(() => {});

  sendSuccess(res, { lead }, 'Lead created', 201);
});

// GET /api/crm/leads/by-task/:taskId
exports.getLeadByTask = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ convertedToTask: req.params.taskId, organizationId: req.user.organizationId })
    .select('_id name phone whatsapp company status isConverted');
  if (!lead) return sendError(res, 'No linked lead found.', 404);
  sendSuccess(res, { lead });
});

// GET /api/crm/leads/:id
exports.getLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
    .populate('assignedTo', 'firstName lastName avatar phone')
    .populate('assignedBy', 'firstName lastName')
    .populate('convertedToTask', 'title status')
    .populate('followUps.performedBy', 'firstName lastName');

  if (!lead) return sendError(res, 'Lead not found.', 404);
  sendSuccess(res, { lead });
});

// PUT /api/crm/leads/:id
exports.updateLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const updates = req.body;
  const previousStatus = lead.status;

  Object.assign(lead, updates);
  lead.updatedBy = req.user._id;

  if (updates.status === LEAD_STATUS.WON && previousStatus !== LEAD_STATUS.WON) lead.convertedAt = new Date();
  if (updates.status === LEAD_STATUS.LOST && previousStatus !== LEAD_STATUS.LOST) lead.lostAt = new Date();

  await lead.save();

  // Write-back to Google Sheets (async, non-blocking)
  Organization.findById(req.user.organizationId).select('googleSheets').then((org) => {
    if (org?.googleSheets?.writeBackEnabled && org?.googleSheets?.sheetId) {
      updateLeadInSheet(org, lead.toObject()).catch(() => {});
    }
  }).catch(() => {});

  sendSuccess(res, { lead }, 'Lead updated');
});

// POST /api/crm/leads/:id/followup
exports.addFollowUp = asyncHandler(async (req, res) => {
  const { scheduledAt, type, notes, outcome, nextAction } = req.body;
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  lead.followUps.push({ scheduledAt, type, notes, outcome, nextAction, performedBy: req.user._id, isCompleted: true, completedAt: new Date() });
  lead.lastContactedAt = new Date();
  if (nextAction) lead.nextFollowUpAt = new Date(scheduledAt);
  lead.isStale = false;
  lead.updatedBy = req.user._id;
  await lead.save();

  sendSuccess(res, { lead }, 'Follow-up recorded');
});

// POST /api/crm/leads/:id/assign
exports.assignLead = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { assignedTo } = req.body;

  if (ROLE_HIERARCHY[req.user.role] < ROLE_HIERARCHY['manager']) {
    return sendError(res, 'Only managers can assign leads.', 403);
  }

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const assignee = await User.findOne({ _id: assignedTo, organizationId: req.user.organizationId });
  if (!assignee) return sendError(res, 'User not found.', 404);

  lead.assignedTo = assignedTo;
  lead.assignedBy = req.user._id;
  lead.assignedAt = new Date();
  await lead.save();

  await createNotification({
    organizationId: req.user.organizationId,
    recipient: assignedTo,
    title: 'Lead Assigned',
    message: `Lead "${lead.name}" has been assigned to you`,
    type: 'crm',
    priority: 'medium',
    actionUrl: `/crm/leads/${lead._id}`,
    reference: { model: 'Lead', id: lead._id },
    channels: { inApp: true, whatsapp: true },
  }, io);

  sendSuccess(res, { lead }, 'Lead assigned');
});

// POST /api/crm/leads/:id/convert-to-task
// Receives { taskId, dueDate } — links an already-created dept-hub root task to this lead
exports.convertToTask = asyncHandler(async (req, res) => {
  const { taskId, dueDate } = req.body;

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);
  if (lead.isConverted) return sendError(res, 'Lead is already converted.', 400);
  if (!taskId) return sendError(res, 'taskId is required.', 400);

  const task = await Task.findOne({ _id: taskId, organizationId: req.user.organizationId });
  if (!task) return sendError(res, 'Task not found.', 404);

  // Generate tracking token and link lead
  const { v4: uuidv4 } = require('uuid');
  const trackingToken = uuidv4();
  lead.convertedToTask = task._id;
  lead.isConverted = true;
  lead.trackingToken = trackingToken;
  lead.convertedAt = new Date();
  await lead.save();

  // WhatsApp confirmation to client with tracking link
  const phone = lead.whatsapp || lead.phone;
  if (phone) {
    const { sendMessage } = require('../services/whatsapp.service');
    const APP_URL = process.env.APP_URL || 'https://backero-worktaskflow.netlify.app';
    const trackingUrl = `${APP_URL}/track/${trackingToken}`;
    const deliveryDays = dueDate
      ? Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24))
      : null;
    const msg =
      `*🎉 Order Confirmed — Backero*\n\n` +
      `Hi ${lead.name},\n\n` +
      `Thank you! Your order has been confirmed and our team has started working on it.\n\n` +
      `📦 *Order:* ${task.title}\n` +
      (deliveryDays && deliveryDays > 0 ? `📅 *Estimated Delivery:* ${deliveryDays} day${deliveryDays !== 1 ? 's' : ''}\n` : '') +
      `⚡ *Priority:* ${task.priority}\n\n` +
      `🔗 *Track your order anytime:*\n${trackingUrl}\n\n` +
      `We'll keep you updated at every stage.\n\n` +
      `_— Backero Team_`;
    sendMessage(phone, msg).catch(() => {});
  }

  sendSuccess(res, { task, lead, trackingToken }, 'Lead converted to project');
});

// POST /api/crm/leads/:id/send-update
exports.sendClientUpdate = asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return sendError(res, 'Message is required.', 400);

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const phone = lead.whatsapp || lead.phone;
  if (!phone) return sendError(res, 'No phone number available for this lead.', 400);

  const { sendMessage } = require('../services/whatsapp.service');
  const text =
    `*📦 Order Update — Backero*\n\n` +
    `${message}\n\n` +
    `_Sent by: ${req.user.firstName} ${req.user.lastName}_`;

  const sent = await sendMessage(phone, text);

  lead.followUps.push({
    type: 'whatsapp',
    scheduledAt: new Date(),
    notes: `Client update sent: "${message}"`,
    outcome: 'WhatsApp update sent to client',
    performedBy: req.user._id,
  });
  await lead.save();

  sendSuccess(res, { sent }, 'Update sent to client via WhatsApp');
});

// GET /api/crm/pipeline
exports.getPipeline = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const filter = { organizationId: orgId };
  const level = ROLE_HIERARCHY[req.user.role] || 1;
  if (level <= 2) filter.assignedTo = req.user._id; // member/team_lead: own leads only

  const pipeline = await Lead.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: 'productionqueries',
        localField: '_id',
        foreignField: 'leadId',
        as: 'queries',
      },
    },
    {
      $addFields: {
        pendingQueries: {
          $size: { $filter: { input: '$queries', as: 'q', cond: { $eq: ['$$q.status', 'pending'] } } },
        },
        answeredQueries: {
          $size: { $filter: { input: '$queries', as: 'q', cond: { $eq: ['$$q.status', 'answered'] } } },
        },
        answeredQueryList: {
          $map: {
            input: { $filter: { input: '$queries', as: 'q', cond: { $eq: ['$$q.status', 'answered'] } } },
            as: 'q',
            in: { title: '$$q.title', description: '$$q.description', answer: '$$q.answer' },
          },
        },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$estimatedValue' },
        leads: {
          $push: {
            _id: '$_id', name: '$name', phone: '$phone', priority: '$priority',
            estimatedValue: '$estimatedValue', assignedTo: '$assignedTo',
            nextFollowUpAt: '$nextFollowUpAt',
            pendingQueries: '$pendingQueries',
            answeredQueries: '$answeredQueries',
            answeredQueryList: '$answeredQueryList',
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  sendSuccess(res, { pipeline });
});

// GET /api/crm/analytics
exports.getAnalytics = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;

  const [totalLeads, wonLeads, lostLeads, sourceBreakdown, conversionRate, upcomingFollowUps] = await Promise.all([
    Lead.countDocuments({ organizationId: orgId }),
    Lead.countDocuments({ organizationId: orgId, status: LEAD_STATUS.WON }),
    Lead.countDocuments({ organizationId: orgId, status: LEAD_STATUS.LOST }),
    Lead.aggregate([{ $match: { organizationId: orgId } }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: { organizationId: orgId } }, { $group: { _id: null, total: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ['$status', 'Payment Pending'] }, 1, 0] } } } }]),
    Lead.find({ organizationId: orgId, nextFollowUpAt: { $gte: new Date(), $lte: new Date(Date.now() + 24 * 60 * 60 * 1000) } })
      .populate('assignedTo', 'firstName lastName').limit(10),
  ]);

  sendSuccess(res, {
    analytics: {
      totalLeads,
      wonLeads,
      lostLeads,
      sourceBreakdown,
      conversionRate: totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0,
      upcomingFollowUps,
    },
  });
});

exports.deleteLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  await lead.deleteOne();

  await ActivityLog.create({
    organizationId: req.user.organizationId,
    performedBy: req.user._id,
    action: 'lead_deleted',
    module: 'crm',
    reference: { model: 'Lead', id: lead._id, title: lead.name },
  });

  sendSuccess(res, {}, 'Lead deleted');
});

// POST /api/crm/leads/:id/query
exports.raiseQuery = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { title, description, urgency, assignedTo } = req.body;
  if (!title || !description) return sendError(res, 'Title and description are required', 400);

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const ProductionQuery = require('../models/ProductionQuery');
  const query = await ProductionQuery.create({
    organizationId: req.user.organizationId,
    leadId: lead._id,
    leadName: lead.name,
    raisedBy: req.user._id,
    assignedTo: assignedTo || undefined,
    title,
    description,
    urgency: urgency || 'medium',
    preQueryStatus: lead.status,
  });

  lead.status = LEAD_STATUS.QUERY_PENDING;
  lead.updatedBy = req.user._id;
  await lead.save();

  // Notify only the assigned person; if none, notify all production members
  const recipientIds = assignedTo
    ? [assignedTo]
    : (await User.find({ organizationId: req.user.organizationId, department: 'Production' }).select('_id')).map(u => u._id);

  for (const recipientId of recipientIds) {
    await createNotification({
      organizationId: req.user.organizationId,
      recipient: recipientId,
      title: 'Technical Query from Sales',
      message: `"${title}" — Lead: ${lead.name}. Urgency: ${urgency || 'medium'}`,
      type: 'crm',
      priority: urgency === 'high' ? 'high' : 'medium',
      actionUrl: '/crm/queries',
      reference: { model: 'ProductionQuery', id: query._id },
      channels: { inApp: true, whatsapp: true },
      createdBy: req.user._id,
    }, io);
  }

  sendSuccess(res, { query }, 'Query raised', 201);
});

// GET /api/crm/leads/:id/queries
exports.getLeadQueries = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const ProductionQuery = require('../models/ProductionQuery');
  const queries = await ProductionQuery.find({ leadId: req.params.id, organizationId: req.user.organizationId })
    .populate('raisedBy', 'firstName lastName')
    .populate('assignedTo', 'firstName lastName department')
    .populate('answeredBy', 'firstName lastName')
    .sort({ createdAt: -1 });

  sendSuccess(res, { queries });
});

// GET /api/crm/queries
exports.getQueries = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const ProductionQuery = require('../models/ProductionQuery');

  const filter = { organizationId: req.user.organizationId };
  if (status) filter.status = status;

  const level = ROLE_HIERARCHY[req.user.role] || 1;
  if (level <= 2) {
    if (req.user.department === 'Production') {
      filter.$or = [{ assignedTo: req.user._id }, { assignedTo: { $exists: false } }];
    } else {
      filter.raisedBy = req.user._id;
    }
  }

  const queries = await ProductionQuery.find(filter)
    .populate('raisedBy', 'firstName lastName department')
    .populate('assignedTo', 'firstName lastName department')
    .populate('answeredBy', 'firstName lastName')
    .populate('leadId', 'name phone company')
    .sort({ status: 1, createdAt: -1 });

  sendSuccess(res, { queries });
});

// PUT /api/crm/queries/:queryId/reply
exports.answerQuery = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { answer } = req.body;
  if (!answer) return sendError(res, 'Answer is required', 400);

  const ProductionQuery = require('../models/ProductionQuery');
  const query = await ProductionQuery.findOne({ _id: req.params.queryId, organizationId: req.user.organizationId });
  if (!query) return sendError(res, 'Query not found.', 404);

  query.status = 'answered';
  query.answer = answer;
  query.answeredBy = req.user._id;
  query.answeredAt = new Date();
  await query.save();

  const lead = await Lead.findById(query.leadId);
  if (lead && lead.status === LEAD_STATUS.QUERY_PENDING) {
    lead.status = query.preQueryStatus || LEAD_STATUS.INTERESTED;
    lead.updatedBy = req.user._id;
    await lead.save();
  }

  await createNotification({
    organizationId: req.user.organizationId,
    recipient: query.raisedBy,
    title: 'Production Query Answered',
    message: `Your query "${query.title}" for lead ${query.leadName} has been answered by the Production team.`,
    type: 'crm',
    priority: 'high',
    actionUrl: `/crm/leads/${query.leadId}`,
    reference: { model: 'ProductionQuery', id: query._id },
    channels: { inApp: true, whatsapp: true },
    createdBy: req.user._id,
  }, io);

  sendSuccess(res, { query }, 'Query answered');
});
