const Lead = require('../models/Lead');
const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { LEAD_STATUS, SOCKET_EVENTS, ROLE_HIERARCHY, ROLES } = require('../utils/constants');
const { createNotification } = require('../services/notification.service');
const { appendLeadToSheet, updateLeadInSheet } = require('../services/googleSheets.service');

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
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { company: { $regex: search, $options: 'i' } },
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

  // Write-back to Google Sheets (async, non-blocking)
  Organization.findById(req.user.organizationId).select('googleSheets').then((org) => {
    if (org?.googleSheets?.writeBackEnabled && org?.googleSheets?.sheetId) {
      appendLeadToSheet(org, lead).catch(() => {});
    }
  }).catch(() => {});

  sendSuccess(res, { lead }, 'Lead created', 201);
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
exports.convertToTask = asyncHandler(async (req, res) => {
  const { title, description, department, assignedTo, dueDate, priority } = req.body;
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const task = await Task.create({
    organizationId: req.user.organizationId,
    title: title || `Follow up with ${lead.name}`,
    description: description || `Lead: ${lead.name} | Phone: ${lead.phone} | Company: ${lead.company}`,
    department: department || 'Sales',
    assignedTo: assignedTo || lead.assignedTo,
    assignedBy: req.user._id,
    dueDate,
    priority: priority || lead.priority,
    status: 'Assigned',
    relatedTo: { model: 'Lead', id: lead._id },
    createdBy: req.user._id,
  });

  lead.convertedToTask = task._id;
  lead.isConverted = true;
  await lead.save();

  sendSuccess(res, { task, lead }, 'Lead converted to task');
});

// GET /api/crm/pipeline
exports.getPipeline = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const filter = { organizationId: orgId };
  const level = ROLE_HIERARCHY[req.user.role] || 1;
  if (level <= 2) filter.assignedTo = req.user._id; // member/team_lead: own leads only

  const pipeline = await Lead.aggregate([
    { $match: filter },
    { $group: { _id: '$status', count: { $sum: 1 }, totalValue: { $sum: '$estimatedValue' }, leads: { $push: { _id: '$_id', name: '$name', phone: '$phone', priority: '$priority', estimatedValue: '$estimatedValue', assignedTo: '$assignedTo' } } } },
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
    Lead.aggregate([{ $match: { organizationId: orgId } }, { $group: { _id: null, total: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ['$status', 'Won'] }, 1, 0] } } } }]),
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
