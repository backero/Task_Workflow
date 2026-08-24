const Lead = require('../models/Lead');
const logger = require('../utils/logger');
const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Invoice = require('../models/Invoice');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse, generateInvoiceNumber } = require('../utils/helpers');
const { LEAD_STATUS, SOCKET_EVENTS, ROLE_HIERARCHY, ROLES, SAMPLE_SUB_STAGES } = require('../utils/constants');
const { createNotification } = require('../services/notification.service');
const { appendLeadToSheet, updateLeadInSheet } = require('../services/googleSheets.service');
const { sendSampleDispatchedToClient, sendDispatchedFeedbackRequest, sendNewLeadAlertDM, sendActiveClientStageUpdate, sendDispatchedWithMedia, uploadMedia } = require('../services/whatsappCloud.service');
const { buildIngredientsFromCatalogProduct, computeFormulaCost } = require('../utils/productionHelpers');

// Individual DMs to the Sales department replace the old WhatsApp-group broadcast
// (Cloud API can't send to groups at all).
async function notifySalesTeamOfNewLead(organizationId, leadData) {
  const members = await User.find({ organizationId, department: 'Sales', isActive: true }).select('phone whatsapp settings');
  await Promise.all(members.map((m) => {
    const waPhone = m.whatsapp || m.phone;
    if (!waPhone || m.settings?.notifications?.whatsapp === false) return null;
    return sendNewLeadAlertDM(waPhone, leadData).catch(() => {});
  }));
}

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
      .populate('inCharge', 'firstName lastName avatar')
      .populate('assignedBy', 'firstName lastName')
      .populate({
        path: 'productionOrderId',
        select: 'orderNumber batch batchSizeKg unit stage status deliveryDate catalogProduct',
        populate: { path: 'catalogProduct', select: 'name code' },
      })
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
  const { name, email, phone, whatsapp, company, source, status, priority, productInterest, estimatedValue, notes, campaign, city, state, designation, businessType } = req.body;
  // "Unassigned" in the Add Lead form submits an empty string, which Mongoose can't cast to ObjectId.
  const assignedTo = req.body.assignedTo || undefined;

  // Check duplicate by phone in org
  const existing = await Lead.findOne({ organizationId: req.user.organizationId, phone });
  if (existing) return sendError(res, `Lead with phone ${phone} already exists.`, 409);

  const initialStage = status || LEAD_STATUS.NEW;
  const lead = await Lead.create({
    organizationId: req.user.organizationId,
    name, email, phone, whatsapp, company, source, status: initialStage, priority, productInterest, estimatedValue,
    assignedTo, notes, campaign, city, state, designation, businessType,
    assignedBy: assignedTo ? req.user._id : undefined,
    assignedAt: assignedTo ? new Date() : undefined,
    createdBy: req.user._id,
    stageHistory: [{ stage: initialStage, enteredAt: new Date(), movedBy: req.user._id }],
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

  // Notify Sales team individually (async, non-blocking) — replaces the old WhatsApp group broadcast
  const createdByName = `${req.user.firstName} ${req.user.lastName}`.trim();
  notifySalesTeamOfNewLead(req.user.organizationId, { ...lead.toObject(), createdByName }).catch(() => {});

  // Welcome message to the client (async, non-blocking)
  const newLeadPhone = lead.whatsapp || lead.phone;
  if (newLeadPhone) {
    sendActiveClientStageUpdate(newLeadPhone, {
      name: lead.name,
      stage: lead.status,
      lastUpdate: "Welcome to Backero! Thank you for reaching out — our team will get in touch with you shortly to understand your requirements.",
    }).catch((err) => logger.error(err));
  }

  Organization.findById(req.user.organizationId).select('googleSheets').then((org) => {
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
    .populate('inCharge', 'firstName lastName avatar phone')
    .populate('assignedBy', 'firstName lastName')
    .populate('convertedToTask', 'title status')
    .populate('productionOrderId', 'orderNumber batch stage status deliveryDate priority')
    .populate('samples.invoiceId', 'invoiceNumber type status totalAmount paidAmount balanceAmount')
    .populate('samples.finalInvoiceId', 'invoiceNumber type status totalAmount paidAmount balanceAmount')
    .populate('samples.productionOrderId', 'orderNumber batch stage status')
    .populate('createdBy', 'firstName lastName')
    .populate('followUps.performedBy', 'firstName lastName')
    .populate('sampleDetails.teamUpdates.postedBy', 'firstName lastName')
    .populate('sampleDetails.clientNotes.postedBy', 'firstName lastName')
    .populate('stageHistory.movedBy', 'firstName lastName')
    .populate('communicationLogs.addedBy', 'firstName lastName');

  if (!lead) return sendError(res, 'Lead not found.', 404);
  sendSuccess(res, { lead });
});

function validateStageTransition(existing, newStatus, body) {
  if (newStatus === 'Sample') {
    if (!existing.productInterest?.length) return 'Add product interest before moving to Sample stage';
    if (!existing.estimatedValue || existing.estimatedValue <= 0) return 'Add estimated value before moving to Sample stage';
  }
  if (newStatus === 'In Progress') {
    const hasApprovedSample = (existing.samples || []).some((s) => s.status === 'Approved');
    if (!existing.sampleDetails?.sentDate && !hasApprovedSample) {
      return 'Approve a sample in Sample Production (or fill in the sample Sent Date) before moving to Production';
    }
  }
  if (newStatus === 'Payment Pending') {
    if (!body.dealValue || Number(body.dealValue) <= 0) return 'Enter confirmed deal value to mark as Payment Pending';
  }
  if (newStatus === 'Lost') {
    if (!body.lostReason?.trim()) return 'Select a reason for marking this lead as Lost';
  }
  return null;
}

// Sample Production is now the single place the whole pre-dispatch lifecycle happens,
// so a lead no longer needs a manual CRM "move to Sample" stage transition first — the
// first real Sample Production activity (formula, product link, or sample) against a
// New Lead/Follow-up lead promotes it automatically. Mirrors updateLead's stageHistory
// + WhatsApp stage-update side effects but skips validateStageTransition's gate, since
// this is a system-driven transition rather than a user-initiated one.
async function promoteToSampleIfNeeded(lead, req) {
  if (![LEAD_STATUS.NEW, LEAD_STATUS.FOLLOWUP].includes(lead.status)) return;

  const now = new Date();
  const prevHistory = (lead.stageHistory || []).map((h) => ({
    stage: h.stage, enteredAt: h.enteredAt, exitedAt: h.exitedAt, movedBy: h.movedBy,
  }));
  if (!prevHistory.length) {
    prevHistory.push({ stage: lead.status, enteredAt: lead.createdAt, exitedAt: now, movedBy: req.user._id });
  } else {
    prevHistory[prevHistory.length - 1].exitedAt = now;
  }
  prevHistory.push({ stage: LEAD_STATUS.SAMPLE, enteredAt: now, movedBy: req.user._id });

  lead.status = LEAD_STATUS.SAMPLE;
  lead.stageHistory = prevHistory;
  lead.updatedBy = req.user._id;
  await lead.save();

  const clientPhone = lead.whatsapp || lead.phone;
  if (clientPhone) {
    sendActiveClientStageUpdate(clientPhone, {
      name: lead.name,
      stage: lead.status,
      lastUpdate: lead.productInterest?.length ? `We're now preparing your sample for: ${lead.productInterest.join(', ')}` : undefined,
    }).catch(logger.error);
  }
}

// Mirrors promoteToSampleIfNeeded above, one stage later: once a sample is Approved the lead
// should show up in Approvals (status In Progress, no productionOrderId yet) instead of staying
// stuck under Sample — otherwise it never leaves the Sample tab since nothing else flips status.
async function promoteToInProgressIfApproved(lead, req) {
  if (lead.status !== LEAD_STATUS.SAMPLE) return;

  const now = new Date();
  const prevHistory = (lead.stageHistory || []).map((h) => ({
    stage: h.stage, enteredAt: h.enteredAt, exitedAt: h.exitedAt, movedBy: h.movedBy,
  }));
  if (prevHistory.length) prevHistory[prevHistory.length - 1].exitedAt = now;
  prevHistory.push({ stage: LEAD_STATUS.IN_PROGRESS, enteredAt: now, movedBy: req.user._id });

  lead.status = LEAD_STATUS.IN_PROGRESS;
  lead.stageHistory = prevHistory;

  const clientPhone = lead.whatsapp || lead.phone;
  if (clientPhone) {
    sendActiveClientStageUpdate(clientPhone, {
      name: lead.name,
      stage: lead.status,
      lastUpdate: 'Your sample was approved — we\'re moving it toward production.',
    }).catch(logger.error);
  }
}

// PUT /api/crm/leads/:id
exports.updateLead = asyncHandler(async (req, res) => {
  const existing = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!existing) return sendError(res, 'Lead not found.', 404);

  const updates = req.body;

  if (updates.status && updates.status !== existing.status) {
    const gateError = validateStageTransition(existing, updates.status, updates);
    if (gateError) return sendError(res, gateError, 422);
  }
  const setFields = { ...updates, updatedBy: req.user._id };
  // "Unassigned" in the Edit Lead form submits an empty string, which Mongoose can't cast to ObjectId.
  if (setFields.assignedTo === '') setFields.assignedTo = null;
  if (setFields.inCharge === '') setFields.inCharge = null;

  if (updates.status === LEAD_STATUS.WON && existing.status !== LEAD_STATUS.WON) setFields.convertedAt = new Date();
  if (updates.status === LEAD_STATUS.LOST && existing.status !== LEAD_STATUS.LOST) setFields.lostAt = new Date();

  // Stage history tracking
  if (updates.status && updates.status !== existing.status) {
    const now = new Date();
    const prev = (existing.stageHistory || []).map(h => ({
      stage: h.stage, enteredAt: h.enteredAt, exitedAt: h.exitedAt, movedBy: h.movedBy,
    }));
    if (!prev.length) {
      prev.push({ stage: existing.status, enteredAt: existing.createdAt, exitedAt: now, movedBy: req.user._id });
    } else {
      prev[prev.length - 1].exitedAt = now;
    }
    prev.push({ stage: updates.status, enteredAt: now, movedBy: req.user._id });
    setFields.stageHistory = prev;
  }

  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { $set: setFields },
    { new: true, runValidators: false }
  );

  // Write-back to Google Sheets (async, non-blocking)
  Organization.findById(req.user.organizationId).select('googleSheets').then((org) => {
    if (org?.googleSheets?.writeBackEnabled && org?.googleSheets?.sheetId) {
      updateLeadInSheet(org, lead.toObject()).catch(() => {});
    }
  }).catch(() => {});

  // Dispatch feedback request to client (async, non-blocking)
  if (updates.status === 'Dispatched' && existing.status !== 'Dispatched') {
    const clientPhone = lead.whatsapp || lead.phone;
    if (clientPhone) {
      sendDispatchedFeedbackRequest(clientPhone, {
        name: lead.name,
        product: lead.sampleDetails?.product || (lead.productInterest?.[0] || ''),
      }).catch(logger.error);
    }
  } else if (updates.status && updates.status !== existing.status && updates.status !== LEAD_STATUS.LOST) {
    // Follow-up stage-update message to client for every other status change (async, non-blocking)
    const clientPhone = lead.whatsapp || lead.phone;
    if (clientPhone) {
      sendActiveClientStageUpdate(clientPhone, { name: lead.name, stage: lead.status }).catch(logger.error);
    }
  }

  // Changing In-charge takes effect immediately, not just on production orders created after
  // this point — update the owner on whatever's already linked to this lead too (the lead-wide
  // order, and every per-product sample order). Doesn't touch the per-stage Team Assignment
  // names (weighPerson etc.) — those reflect who's actually doing that stage's work already.
  if ('inCharge' in updates && String(updates.inCharge || '') !== String(existing.inCharge || '')) {
    const ProductionOrder = require('../models/ProductionOrder');
    const orderIds = [lead.productionOrderId, ...(lead.samples || []).map((s) => s.productionOrderId)].filter(Boolean);
    if (orderIds.length) {
      await ProductionOrder.updateMany(
        { _id: { $in: orderIds }, organizationId: req.user.organizationId },
        { $set: { assignedTo: lead.inCharge || null, updatedBy: req.user._id } }
      );
    }
  }

  sendSuccess(res, { lead }, 'Lead updated');
});

// PUT /api/crm/leads/:id/sample
exports.updateSampleDetails = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const {
    product, quantity, sentDate, courier, chargeAmount, chargeBy,
    paymentStatus, advanceAmount, paymentMode, preparationDays, startedAt,
    // R&D/sampling payment audit trail
    paymentTxnRef, paidAt, receivedBy, paymentNotes,
    // Rich intake form fields
    discussion, sampleProducts, shippingAddress, outerCartonRequired, outerCartonSize,
    // Work tracking
    workStarted, workStartedAt,
  } = req.body;

  const $set = { updatedBy: req.user._id };
  if (product !== undefined)              $set['sampleDetails.product']              = product;
  if (quantity !== undefined)             $set['sampleDetails.quantity']             = Number(quantity) || 0;
  if (sentDate !== undefined)             $set['sampleDetails.sentDate']             = sentDate || null;
  if (courier !== undefined)              $set['sampleDetails.courier']              = courier;
  if (chargeAmount !== undefined)         $set['sampleDetails.chargeAmount']         = Number(chargeAmount) || 0;
  if (chargeBy !== undefined)             $set['sampleDetails.chargeBy']             = chargeBy;
  if (paymentStatus !== undefined)        $set['sampleDetails.paymentStatus']        = paymentStatus;
  if (advanceAmount !== undefined)        $set['sampleDetails.advanceAmount']        = Number(advanceAmount) || 0;
  if (paymentMode !== undefined)          $set['sampleDetails.paymentMode']          = paymentMode;
  if (paymentTxnRef !== undefined)        $set['sampleDetails.paymentTxnRef']        = paymentTxnRef;
  if (paidAt !== undefined)               $set['sampleDetails.paidAt']               = paidAt || null;
  if (receivedBy !== undefined)           $set['sampleDetails.receivedBy']           = receivedBy;
  if (paymentNotes !== undefined)         $set['sampleDetails.paymentNotes']         = paymentNotes;
  if (preparationDays !== undefined)      $set['sampleDetails.preparationDays']      = Number(preparationDays) || 0;
  if (startedAt !== undefined)            $set['sampleDetails.startedAt']            = startedAt || new Date();
  if (discussion !== undefined)           $set['sampleDetails.discussion']           = discussion;
  if (sampleProducts !== undefined)       $set['sampleDetails.sampleProducts']       = sampleProducts;
  if (shippingAddress !== undefined)      $set['sampleDetails.shippingAddress']      = shippingAddress;
  if (outerCartonRequired !== undefined)  $set['sampleDetails.outerCartonRequired']  = outerCartonRequired;
  if (outerCartonSize !== undefined)      $set['sampleDetails.outerCartonSize']      = outerCartonSize;
  if (workStarted !== undefined)          $set['sampleDetails.workStarted']          = workStarted;
  if (workStartedAt !== undefined)        $set['sampleDetails.workStartedAt']        = workStartedAt || new Date();

  const updatedLead = await Lead.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { $set },
    { new: true, runValidators: false }
  );

  // Auto-create Finance Transaction when payment is first recorded
  const paymentRecorded = paymentStatus === 'full_paid';
  const advance = Number(advanceAmount) || 0;
  if (paymentRecorded && advance > 0 && !lead.sampleDetails?.financeTransactionId) {
    const Transaction = require('../models/Transaction');
    const txn = await Transaction.create({
      organizationId: req.user.organizationId,
      type: 'income',
      category: 'CRM Sales',
      subCategory: 'Sample Payment',
      amount: advance,
      currency: 'INR',
      description: `Sample payment from ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
      date: new Date(),
      paymentMethod: paymentMode || 'upi',
      reference: `SAMPLE-${lead._id}`,
      createdBy: req.user._id,
    });
    await Lead.findOneAndUpdate(
      { _id: req.params.id },
      { $set: { 'sampleDetails.financeTransactionId': txn._id } },
      { runValidators: false }
    );
  }

  // Notify the client's end-to-end owner (Lead.assignedTo) once the R&D/sampling fee is
  // confirmed — this and sample approval (below) previously notified nobody, leaving the
  // person actually in charge of this client to find out only by checking back manually.
  if (paymentStatus === 'full_paid' && lead.sampleDetails?.paymentStatus !== 'full_paid' && lead.assignedTo) {
    await createNotification({
      organizationId: req.user.organizationId,
      recipient: lead.assignedTo,
      title: '💳 R&D Payment Confirmed',
      message: `${lead.name}'s R&D/sampling payment has been confirmed — sampling can proceed.`,
      type: 'crm',
      priority: 'medium',
      actionUrl: `/samples?open=${lead._id}`,
      reference: { model: 'Lead', id: lead._id },
      channels: { inApp: true, whatsapp: true },
    }, req.app.get('io'));
  }

  // Notify client when sample is dispatched for the first time (sentDate newly set)
  if (sentDate && !lead.sampleDetails?.sentDate) {
    const clientPhone = lead.whatsapp || lead.phone;
    if (clientPhone) {
      sendSampleDispatchedToClient(clientPhone, {
        name: lead.name,
        product: lead.sampleDetails?.product || product || '',
        quantity: lead.sampleDetails?.quantity || quantity || '',
        courier: lead.sampleDetails?.courier || courier || '',
        sentDate,
      }).catch(logger.error);
    }
  }

  sendSuccess(res, { lead: updatedLead }, 'Sample details saved');
});

// PUT /api/crm/leads/:id/sample/stage  { subStage, rejectionReason? }
// Moves the sample through Requested -> In Lab -> Sent -> Feedback -> Approved/Rejected.
// Mirrors the "no payment = no sampling" rule from the design reference — leaving Requested
// requires the R&D/sampling fee to already be marked full_paid via updateSampleDetails.
exports.updateSampleSubStage = asyncHandler(async (req, res) => {
  const { subStage, rejectionReason } = req.body;
  if (!SAMPLE_SUB_STAGES.includes(subStage)) return sendError(res, 'Invalid sample stage.', 400);

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  if (subStage !== 'Requested' && lead.sampleDetails?.paymentStatus !== 'full_paid') {
    return sendError(res, 'Confirm the R&D/sampling fee payment before moving this sample forward.', 422);
  }
  if (subStage === 'Rejected' && !rejectionReason?.trim()) {
    return sendError(res, 'Add a reason for rejecting this sample.', 400);
  }

  lead.sampleDetails.subStage = subStage;
  lead.sampleDetails.rejectionReason = subStage === 'Rejected' ? rejectionReason.trim() : undefined;
  lead.sampleDetails.subStageHistory = lead.sampleDetails.subStageHistory || [];
  lead.sampleDetails.subStageHistory.push({ subStage, movedBy: req.user._id });

  if (subStage === 'Approved') await promoteToInProgressIfApproved(lead, req);

  lead.updatedBy = req.user._id;
  await lead.save();

  sendSuccess(res, { lead }, 'Sample stage updated');
});

// POST /api/crm/leads/:id/formulas  { name, productLink?, refWeight?, rows?, costPerUnit?, status? }
// `rows` (if provided) are real Raw Material picks — { rawMaterialId, name, quantity, unit, costPerKg }
// — and cost/unit is computed from them, same math as CatalogProduct.formulation. A manual
// costPerUnit is only used as a fallback when no rows are given.
exports.createFormula = asyncHandler(async (req, res) => {
  const { name, productId, productLink, catalogProductId, refWeight, refUnit, rows, costPerUnit, status, procedure } = req.body;
  if (!name?.trim()) return sendError(res, 'Formula name is required.', 400);
  if (!productId) return sendError(res, 'Select which product this formula is for.', 400);

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);
  const product = (lead.productLinks || []).find((p) => p.productId === productId);
  if (!product) return sendError(res, 'That product is not linked to this lead — add it in the Products tab first.', 400);
  await promoteToSampleIfNeeded(lead, req);

  lead.customFormulas = lead.customFormulas || [];
  const formulaId = `FORM-${String(lead._id).slice(-4).toUpperCase()}-${lead.customFormulas.length + 1}`;
  const computedCost = rows?.length ? computeFormulaCost(rows) : Number(costPerUnit) || 0;
  lead.customFormulas.push({
    formulaId,
    name: name.trim(),
    productId,
    productLink: productLink || product.name || '',
    catalogProductId: catalogProductId || undefined,
    refWeight: Number(refWeight) || 100,
    refUnit: refUnit || 'g',
    currentVersion: 1,
    versions: [{ version: 1, status: status || 'Draft', costPerUnit: computedCost, rows: rows || [], procedure: procedure || undefined }],
    createdBy: req.user._id,
  });
  lead.updatedBy = req.user._id;
  await lead.save();
  sendSuccess(res, { lead }, 'Formula created', 201);
});

// PUT /api/crm/leads/:id/formulas/:formulaId  { status?, costPerUnit?, rows?, bumpVersion?, version?, refUnit?, refWeight?, procedure?, changeNote? }
// `version` (optional) targets a specific version to edit instead of the latest — used e.g.
// to archive an older Draft/In Testing version without disturbing the current one, or to save
// edits made while viewing a non-latest version in the Formula Editor's version sidebar.
exports.updateFormula = asyncHandler(async (req, res) => {
  const { status, costPerUnit, rows, bumpVersion, version, refUnit, refWeight, procedure, changeNote, researchNotes, productId } = req.body;
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const formula = (lead.customFormulas || []).find((f) => f.formulaId === req.params.formulaId);
  if (!formula) return sendError(res, 'Formula not found.', 404);
  if (refUnit) formula.refUnit = refUnit;
  if (refWeight !== undefined) formula.refWeight = Number(refWeight) || formula.refWeight;
  if (researchNotes !== undefined) formula.researchNotes = researchNotes;
  if (productId !== undefined) {
    const product = (lead.productLinks || []).find((p) => p.productId === productId);
    if (!product) return sendError(res, 'That product is not linked to this lead.', 400);
    formula.productId = productId;
    formula.productLink = product.name || productId;
  }

  if (bumpVersion) {
    const prev = formula.versions[formula.versions.length - 1];
    const newRows = rows || prev?.rows || [];
    const newCost = newRows.length ? computeFormulaCost(newRows) : (costPerUnit !== undefined ? Number(costPerUnit) || 0 : prev?.costPerUnit || 0);
    formula.currentVersion += 1;
    formula.versions.push({ version: formula.currentVersion, status: status || 'Draft', costPerUnit: newCost, rows: newRows, procedure: procedure !== undefined ? procedure : prev?.procedure, changeNote: changeNote || undefined });
  } else {
    const target = version !== undefined
      ? formula.versions.find((v) => v.version === Number(version))
      : formula.versions[formula.versions.length - 1];
    if (!target) return sendError(res, 'Formula version not found.', 404);
    // Locked once Accepted — content (rows/cost/procedure) shouldn't silently change under an
    // already-approved formula. Rework goes through bumpVersion instead, which keeps this
    // version's accepted content intact and starts a new one to revise.
    const editingContent = rows !== undefined || costPerUnit !== undefined || procedure !== undefined;
    if (target.status === 'Accepted' && editingContent && status !== 'Accepted') {
      return sendError(res, 'This formula version is Accepted and locked — bump a new version to make changes.', 400);
    }
    if (status) target.status = status;
    if (rows) { target.rows = rows; target.costPerUnit = computeFormulaCost(rows); }
    else if (costPerUnit !== undefined) target.costPerUnit = Number(costPerUnit) || 0;
    if (procedure !== undefined) target.procedure = procedure;
    if (changeNote !== undefined) target.changeNote = changeNote;
  }
  lead.updatedBy = req.user._id;
  await lead.save();
  sendSuccess(res, { lead }, 'Formula updated');
});

// POST /api/crm/leads/:id/formulas/:formulaId/attachment  (multipart: file)
exports.uploadFormulaAttachment = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);
  const formula = (lead.customFormulas || []).find((f) => f.formulaId === req.params.formulaId);
  if (!formula) return sendError(res, 'Formula not found.', 404);
  if (!req.file) return sendError(res, 'No file uploaded', 400);

  const { uploadBuffer } = require('../utils/cloudinary');
  const mime = req.file.mimetype || '';
  const resourceType = mime.startsWith('video/') || mime.startsWith('audio/') ? 'video' : mime.startsWith('image/') ? 'image' : 'raw';
  const result = await uploadBuffer(req.file.buffer, { folder: `backero/crm-formulas/${req.user.organizationId}`, resourceType, filename: req.file.originalname });

  formula.attachments = formula.attachments || [];
  formula.attachments.push({
    name: req.file.originalname,
    url: result.secure_url,
    type: mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('image/') ? 'image' : 'document',
  });
  lead.updatedBy = req.user._id;
  await lead.save();
  sendSuccess(res, { lead }, 'Attachment uploaded');
});

// DELETE /api/crm/leads/:id/formulas/:formulaId/attachment  (body: { attachmentId })
exports.removeFormulaAttachment = asyncHandler(async (req, res) => {
  const { attachmentId } = req.body;
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);
  const formula = (lead.customFormulas || []).find((f) => f.formulaId === req.params.formulaId);
  if (!formula) return sendError(res, 'Formula not found.', 404);

  formula.attachments = (formula.attachments || []).filter((a) => String(a._id) !== String(attachmentId));
  lead.updatedBy = req.user._id;
  await lead.save();
  sendSuccess(res, { lead }, 'Attachment removed');
});

// POST /api/crm/leads/:id/products  { productId?, catalogProductId?, name, basis?, notes? }
// Pricing is deliberately NOT set here — it flows separately via the row's 💰 Quote Price ->
// ✓ Accept Price actions (updateProductPricing below), same as the reference's Product Link
// modal + Quote Price mini-modal split.
exports.linkProductPricing = asyncHandler(async (req, res) => {
  const { productId, catalogProductId, name, basis, notes } = req.body;
  if (!name?.trim()) return sendError(res, 'Product name is required.', 400);

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);
  await promoteToSampleIfNeeded(lead, req);

  lead.productLinks = lead.productLinks || [];
  lead.productLinks.push({
    productId: productId?.trim() || `PROD-${String(lead._id).slice(-4).toUpperCase()}-${lead.productLinks.length + 1}`,
    catalogProductId: catalogProductId || undefined,
    name: name.trim(),
    basis: basis || 'House Formula',
    notes: notes || undefined,
    createdBy: req.user._id,
  });
  lead.updatedBy = req.user._id;
  await lead.save();
  sendSuccess(res, { lead }, 'Product linked', 201);
});

// PUT /api/crm/leads/:id/products/:productId  { priceStatus?, paymentStatus?, approxPrice?, name?, basis?, notes? }
exports.updateProductPricing = asyncHandler(async (req, res) => {
  const {
    priceStatus, paymentStatus, approxPrice, name, basis, notes,
    // Per-product payment audit trail — mirrors the old lead-wide sampleDetails fields, see
    // Lead.js productLinks schema comment.
    chargeAmount, paymentMode, paymentTxnRef, paidAt, receivedBy, paymentNotes,
  } = req.body;
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const link = (lead.productLinks || []).find((p) => p.productId === req.params.productId);
  if (!link) return sendError(res, 'Product link not found.', 404);

  const wasNewlyPaid = paymentStatus === 'full_paid' && link.paymentStatus !== 'full_paid';
  if (priceStatus) link.priceStatus = priceStatus;
  if (paymentStatus) link.paymentStatus = paymentStatus;
  if (approxPrice !== undefined) link.approxPrice = Number(approxPrice) || 0;
  if (name !== undefined) link.name = name;
  if (basis !== undefined) link.basis = basis;
  if (notes !== undefined) link.notes = notes;
  if (chargeAmount !== undefined) link.chargeAmount = Number(chargeAmount) || 0;
  if (paymentMode !== undefined) link.paymentMode = paymentMode;
  if (paymentTxnRef !== undefined) link.paymentTxnRef = paymentTxnRef;
  if (receivedBy !== undefined) link.receivedBy = receivedBy;
  if (paymentNotes !== undefined) link.paymentNotes = paymentNotes;
  if (paidAt !== undefined) link.paidAt = paidAt || null;
  else if (wasNewlyPaid) link.paidAt = new Date();
  lead.updatedBy = req.user._id;
  await lead.save();

  if (wasNewlyPaid && lead.assignedTo) {
    await createNotification({
      organizationId: req.user.organizationId,
      recipient: lead.assignedTo,
      title: '💳 Product Payment Confirmed',
      message: `${lead.name}'s payment for ${link.name || link.productId} has been confirmed — sampling can proceed for this product.`,
      type: 'crm',
      priority: 'medium',
      actionUrl: `/samples?open=${lead._id}&leadTab=Payments`,
      reference: { model: 'Lead', id: lead._id },
      channels: { inApp: true, whatsapp: true },
    }, req.app.get('io'));
  }

  sendSuccess(res, { lead }, 'Product pricing updated');
});

// DELETE /api/crm/leads/:id/products/:productId
exports.deleteProductLink = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const before = (lead.productLinks || []).length;
  lead.productLinks = (lead.productLinks || []).filter((p) => p.productId !== req.params.productId);
  if (lead.productLinks.length === before) return sendError(res, 'Product link not found.', 404);

  lead.updatedBy = req.user._id;
  await lead.save();
  sendSuccess(res, { lead }, 'Product link removed');
});

// POST /api/crm/leads/:id/samples  { formulaId?, formulaVersionNo?, productId?, chainedFrom?, queryId?, notes? }
// Creates a versioned, chainable sample record. Rejecting a sample (see updateVersionedSampleStatus)
// doesn't auto-create the next version — the team calls this again with chainedFrom to do that explicitly.
exports.createVersionedSample = asyncHandler(async (req, res) => {
  const { formulaId, formulaVersionNo, productId, chainedFrom, queryId, notes } = req.body;
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  // Samples can only be drawn from a Draft / In Testing formula version — a Locked/Archived
  // version is frozen history, and Accepted/Rejected already went through this gate once.
  let targetVersion = null;
  if (formulaId) {
    const formula = (lead.customFormulas || []).find((f) => f.formulaId === formulaId);
    if (!formula) return sendError(res, 'Formula not found.', 404);
    targetVersion = formulaVersionNo !== undefined
      ? formula.versions.find((v) => v.version === Number(formulaVersionNo))
      : formula.versions.find((v) => v.version === formula.currentVersion);
    if (!targetVersion) return sendError(res, 'Formula version not found.', 404);
    // Accepted is allowed too — a formula copied from an Active catalog product starts
    // Accepted (already a proven recipe) and still needs to produce its first sample.
    if (!['Draft', 'In Testing', 'Accepted'].includes(targetVersion.status)) {
      return sendError(res, 'Samples can only be made from Draft / In Testing / Accepted formula versions.', 400);
    }
  }

  await promoteToSampleIfNeeded(lead, req);

  lead.samples = lead.samples || [];
  let version = 1;
  if (chainedFrom) {
    const parent = lead.samples.find((s) => s.sampleId === chainedFrom);
    if (parent) version = parent.version + 1;
  }
  const sampleId = `SMPL-${String(lead._id).slice(-4).toUpperCase()}-${lead.samples.length + 1}`;
  lead.samples.push({
    sampleId,
    formulaId: formulaId || undefined,
    formulaVersionNo: targetVersion ? targetVersion.version : undefined,
    productId: productId || undefined,
    version,
    chainedFrom: chainedFrom || undefined,
    queryId: queryId || undefined,
    notes: notes || undefined,
    status: 'Requested',
    timeline: [{ event: chainedFrom ? `Follow-up sample requested (chained from ${chainedFrom})` : 'Sample created' }],
    createdBy: req.user._id,
  });

  // Making a sample from a formula version is itself evidence it's being tested, not just
  // drafted — flip Draft -> In Testing so the version status reflects that automatically.
  if (targetVersion?.status === 'Draft') targetVersion.status = 'In Testing';

  lead.updatedBy = req.user._id;
  await lead.save();
  sendSuccess(res, { lead }, 'Sample created', 201);
});

// PUT /api/crm/leads/:id/samples/:sampleId  { courier?, awb?, sentAt?, packagingConfirmed?, notes? }
exports.updateVersionedSample = asyncHandler(async (req, res) => {
  const { courier, awb, sentAt, packagingConfirmed, notes, productId } = req.body;
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const sample = (lead.samples || []).find((s) => s.sampleId === req.params.sampleId);
  if (!sample) return sendError(res, 'Sample not found.', 404);

  if (productId !== undefined) {
    if (!(lead.productLinks || []).some((p) => p.productId === productId)) return sendError(res, 'That product is not linked to this lead.', 400);
    sample.productId = productId;
  }
  if (courier !== undefined) sample.courier = courier;
  if (awb !== undefined) sample.awb = awb;
  if (notes !== undefined) sample.notes = notes;
  if (sentAt !== undefined) {
    sample.sentAt = sentAt;
    sample.timeline.push({ event: `Dispatched via ${courier || sample.courier || 'courier'} (AWB ${awb || sample.awb || '—'})` });
  }
  if (packagingConfirmed !== undefined) {
    sample.packagingConfirmed = packagingConfirmed;
    if (packagingConfirmed) sample.timeline.push({ event: 'Packaging confirmed by customer' });
  }
  lead.updatedBy = req.user._id;
  await lead.save();
  sendSuccess(res, { lead }, 'Sample updated');
});

// PUT /api/crm/leads/:id/samples/:sampleId/status  { status, rejectionReason?, approvedByContact?, rejectedByContact? }
// Same payment hard-lock as updateSampleSubStage, and keeps lead.sampleDetails.subStage in sync
// with this sample so the existing Sample Production queue/stat cards need no changes.
exports.updateVersionedSampleStatus = asyncHandler(async (req, res) => {
  const { status, rejectionReason, approvedByContact, rejectedByContact } = req.body;
  if (!SAMPLE_SUB_STAGES.includes(status)) return sendError(res, 'Invalid sample status.', 400);

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const sample = (lead.samples || []).find((s) => s.sampleId === req.params.sampleId);
  if (!sample) return sendError(res, 'Sample not found.', 404);

  // Per-product payment gate: a sample tied to a specific product only unlocks once THAT
  // product's own payment is confirmed — paying for one product on a lead no longer unblocks
  // every other product's samples. Resolves via the sample's own productId first, then falls
  // back to its formula's productId (covers samples/formulas made before this field existed —
  // see updateFormula's productId re-link path); only truly unresolvable ones fall back further
  // to the old lead-wide R&D fee gate.
  const resolvedProductId = sample.productId || (lead.customFormulas || []).find((f) => f.formulaId === sample.formulaId)?.productId;
  const productLink = resolvedProductId ? (lead.productLinks || []).find((p) => p.productId === resolvedProductId) : null;
  const productPaid = productLink ? productLink.paymentStatus === 'full_paid' : lead.sampleDetails?.paymentStatus === 'full_paid';
  if (status !== 'Requested' && !productPaid) {
    return sendError(res, productLink
      ? `Confirm payment for ${productLink.name || productLink.productId} in the Payments tab before moving this sample forward.`
      : 'Confirm the R&D/sampling fee payment before moving this sample forward.', 422);
  }
  if (status === 'Rejected' && !rejectionReason?.trim()) return sendError(res, 'Add a reason for rejecting this sample.', 400);

  sample.status = status;
  sample.rejectionReason = status === 'Rejected' ? rejectionReason.trim() : undefined;
  if (status === 'Approved' && approvedByContact !== undefined) sample.approvedByContact = approvedByContact;
  if (status === 'Rejected' && rejectedByContact !== undefined) sample.rejectedByContact = rejectedByContact;
  sample.timeline.push({ event: `Status → ${status}` });

  lead.sampleDetails.subStage = status;
  lead.sampleDetails.subStageHistory = lead.sampleDetails.subStageHistory || [];
  lead.sampleDetails.subStageHistory.push({ subStage: status, movedBy: req.user._id });

  if (status === 'Approved') await promoteToInProgressIfApproved(lead, req);

  lead.updatedBy = req.user._id;
  await lead.save();

  if ((status === 'Approved' || status === 'Rejected') && lead.assignedTo) {
    await createNotification({
      organizationId: req.user.organizationId,
      recipient: lead.assignedTo,
      title: status === 'Approved' ? '✅ Sample Approved' : '↻ Sample Rejected',
      message: status === 'Approved'
        ? `${lead.name}'s sample (${sample.sampleId}) was approved — create its quotation in Approvals to move it toward production.`
        : `${lead.name}'s sample (${sample.sampleId}) was rejected: ${sample.rejectionReason || 'no reason given'}.`,
      type: 'crm',
      priority: status === 'Approved' ? 'medium' : 'high',
      actionUrl: `/samples?open=${lead._id}&leadTab=Approvals`,
      reference: { model: 'Lead', id: lead._id },
      channels: { inApp: true, whatsapp: true },
    }, req.app.get('io'));
  }

  sendSuccess(res, { lead }, 'Sample status updated');
});

// POST /api/crm/leads/:id/samples/:sampleId/feedback  { text }
exports.addSampleFeedback = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return sendError(res, 'Feedback text is required.', 400);

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const sample = (lead.samples || []).find((s) => s.sampleId === req.params.sampleId);
  if (!sample) return sendError(res, 'Sample not found.', 404);

  sample.feedbackLog.push({ by: `${req.user.firstName} ${req.user.lastName}`.trim(), text: text.trim() });
  sample.timeline.push({ event: 'Customer feedback logged' });
  lead.updatedBy = req.user._id;
  await lead.save();
  sendSuccess(res, { lead }, 'Feedback logged');
});

// POST /api/crm/leads/:id/sample/team-update
exports.addSampleTeamUpdate = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return sendError(res, 'Text is required', 400);

  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { $push: { 'sampleDetails.teamUpdates': { text: text.trim(), postedBy: req.user._id, postedAt: new Date() } } },
    { new: true, runValidators: false }
  ).populate('sampleDetails.teamUpdates.postedBy', 'firstName lastName');
  if (!lead) return sendError(res, 'Lead not found.', 404);

  sendSuccess(res, { lead }, 'Team update logged');
});

// POST /api/crm/leads/:id/sample/client-note
exports.addSampleClientNote = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return sendError(res, 'Text is required', 400);

  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { $push: { 'sampleDetails.clientNotes': { text: text.trim(), postedBy: req.user._id, postedAt: new Date() } } },
    { new: true, runValidators: false }
  ).populate('sampleDetails.clientNotes.postedBy', 'firstName lastName');
  if (!lead) return sendError(res, 'Lead not found.', 404);

  sendSuccess(res, { lead }, 'Client note added');
});

// POST /api/crm/leads/:id/sample/image
exports.addSampleImage = asyncHandler(async (req, res) => {
  const { url, name } = req.body;
  if (!url?.trim()) return sendError(res, 'Image URL is required', 400);

  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { $push: { 'sampleDetails.images': { url: url.trim(), name: name?.trim() || 'Product image', addedAt: new Date() } } },
    { new: true, runValidators: false }
  );
  if (!lead) return sendError(res, 'Lead not found.', 404);

  sendSuccess(res, { lead }, 'Image added');
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

  // Acknowledge the follow-up to the client (async, non-blocking)
  const clientPhone = lead.whatsapp || lead.phone;
  if (clientPhone) {
    sendActiveClientStageUpdate(clientPhone, {
      name: lead.name,
      stage: lead.status,
      lastUpdate: nextAction ? `Thanks for connecting with us! Next up: ${nextAction}` : "Thanks for connecting with us today — we'll follow up with more details soon.",
    }).catch((err) => logger.error(err));
  }

  sendSuccess(res, { lead }, 'Follow-up recorded');
});

// POST /api/crm/leads/:id/assign
// Open to any authenticated team member (not manager-gated) — the real workflow is a rep
// making first contact on a new KYC lead, then handing it off to whoever should own that
// client end-to-end; requiring a manager for that handoff would just push people back onto
// the ungated generic PUT /leads/:id, which skips the notification and assignedBy/assignedAt
// audit trail this endpoint exists to provide.
exports.assignLead = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { assignedTo } = req.body;

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
    title: 'Lead Assigned — you\'re now the end-to-end owner',
    message: `"${lead.name}" has been assigned to you — you're in charge of this client through to production dispatch.`,
    type: 'crm',
    priority: 'medium',
    actionUrl: `/crm/leads/${lead._id}`,
    reference: { model: 'Lead', id: lead._id },
    channels: { inApp: true, whatsapp: true },
  }, io);

  // Carry the handoff into Q&A too — any of this lead's queries still open/unresolved follow
  // the client to its new owner instead of staying with the person who's no longer in charge.
  const ProductionQuery = require('../models/ProductionQuery');
  await ProductionQuery.updateMany(
    { organizationId: req.user.organizationId, leadId: lead._id, status: { $in: ['pending', 'in_progress'] } },
    { $set: { assignedTo } }
  );

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
    const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'https://backero-worktaskflow.vercel.app';
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

// POST /api/crm/leads/:id/link-production  { mode: 'create' | 'link', productionOrderId? }
// Links a CRM lead to a Batch Tracker production order — either creating a fresh one
// pre-filled from the lead, or attaching an existing unlinked order. One lead : one batch.
exports.linkProduction = asyncHandler(async (req, res) => {
  const { mode, productionOrderId, catalogProduct, batchSizeKg } = req.body;
  const orgId = req.user.organizationId;

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: orgId });
  if (!lead) return sendError(res, 'Lead not found.', 404);
  if (lead.productionOrderId) return sendError(res, 'This lead is already linked to a batch order.', 400);

  const ProductionOrder = require('../models/ProductionOrder');
  const CatalogProduct = require('../models/CatalogProduct');
  const { PRODUCTION_STATUS, BATCH_PROCESS_STEPS } = require('../utils/constants');

  let order;
  if (mode === 'link') {
    if (!productionOrderId) return sendError(res, 'productionOrderId is required.', 400);
    order = await ProductionOrder.findOne({ _id: productionOrderId, organizationId: orgId });
    if (!order) return sendError(res, 'Production order not found.', 404);
    if (order.leadId) return sendError(res, 'That batch order is already linked to another lead.', 400);
    order.leadId = lead._id;
    order.updatedBy = req.user._id;
    await order.save();
  } else {
    // A batch order with no catalog product has no formulation, so its ingredients
    // list stays empty forever — that permanently locks the Weighing stage's process
    // steps (see BatchTracker.jsx allWeighed gate). Require a real catalog SKU here,
    // same as the manual "+ New Order" flow, so every order can actually reach Dispatch.
    if (!catalogProduct) return sendError(res, 'Select a catalog product for this batch order.', 400);
    const catalogDoc = await CatalogProduct.findOne({ _id: catalogProduct, organizationId: orgId });
    if (!catalogDoc) return sendError(res, 'Catalog product not found.', 404);
    const ingredients = buildIngredientsFromCatalogProduct(catalogDoc, batchSizeKg);

    const count = await ProductionOrder.countDocuments({ organizationId: orgId });
    order = await ProductionOrder.create({
      organizationId: orgId,
      orderNumber: `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
      batch: `BATCH-${Date.now()}`,
      status: PRODUCTION_STATUS.PLANNED,
      stage: 1,
      customer: lead.name,
      contact: lead.whatsapp || lead.phone,
      priority: lead.priority === 'critical' ? 'Urgent' : lead.priority === 'high' ? 'High' : lead.priority === 'low' ? 'Low' : 'Normal',
      // The lead's KYC in-charge (whole Production dept) stays the production order's owner too,
      // so every stage notification (procurement, bulk QC, final QC, ...) reaches the one person
      // responsible for this client end-to-end, and Team Assignment pre-fills to them. Falls
      // back to assignedTo (the narrower intake-rep field) if in-charge was never set.
      assignedTo: lead.inCharge || lead.assignedTo || undefined,
      deliveryDate: lead.inProgressAt && lead.leadTime
        ? new Date(new Date(lead.inProgressAt).getTime() + lead.leadTime * 86400000).toISOString().slice(0, 10)
        : undefined,
      notes: lead.productInterest?.length ? `Interest: ${lead.productInterest.join(', ')}` : undefined,
      leadId: lead._id,
      catalogProduct: catalogDoc._id,
      ingredients,
      processSteps: BATCH_PROCESS_STEPS.map((name) => ({ name, done: false })),
      createdBy: req.user._id,
    });
  }

  lead.productionOrderId = order._id;
  lead.updatedBy = req.user._id;
  await lead.save();

  req.app.get('io')?.to(`org:${orgId}`).emit('production_updated', { orderId: order._id, stage: order.stage, status: order.status });

  sendSuccess(res, { lead, order }, mode === 'link' ? 'Linked to existing batch order' : 'Batch order created and linked');
});

// POST /api/crm/leads/:id/samples/:sampleId/quotation
// Creates a draft Invoice (type: 'quotation') scoped to ONE approved sample/product on this
// lead, so a multi-product lead gets an independent quotation — and later, independent payment
// and production gate — per product instead of one invoice covering the whole lead.
exports.createSampleQuotation = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: orgId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const sample = lead.samples.id(req.params.sampleId);
  if (!sample) return sendError(res, 'Sample not found.', 404);
  if (sample.invoiceId) return sendError(res, 'This product already has a quotation — rework the existing one instead.', 400);

  const productLink = (lead.productLinks || []).find((p) => p.productId === sample.productId);
  const formula = (lead.customFormulas || []).find((f) => f.formulaId === sample.formulaId);
  const description = productLink?.name || formula?.name || sample.productId || `Sample ${sample.sampleId}`;
  const unitPrice = productLink?.approxPrice || 0;
  const gstAmt = (unitPrice * 18) / 100;
  const totalAmount = Math.round(unitPrice + gstAmt);

  const invoice = await Invoice.create({
    organizationId: orgId,
    invoiceNumber: generateInvoiceNumber(),
    type: 'quotation',
    status: 'draft',
    lead: lead._id,
    sampleId: sample._id,
    client: { name: lead.name, email: lead.email, phone: lead.whatsapp || lead.phone, address: lead.company, state: lead.state },
    lineItems: [{ description, quantity: 1, unit: 'pcs', unitPrice, gstRate: 18, gstAmount: gstAmt, discount: 0, total: unitPrice + gstAmt }],
    subtotal: unitPrice,
    totalGst: gstAmt,
    totalAmount,
    balanceAmount: totalAmount,
    createdBy: req.user._id,
  });

  sample.invoiceId = invoice._id;
  lead.updatedBy = req.user._id;
  await lead.save();

  sendSuccess(res, { lead, invoice }, 'Quotation created', 201);
});

// POST /api/crm/leads/:id/samples/:sampleId/invoice
// "Create Invoice" in Approvals — once this sample's quotation (sample.invoiceId) is fully
// paid, generates the formal tax invoice (type: 'invoice') as its own document, copied from
// the quotation's line items/amounts, rather than mutating the quotation in place — Finance
// keeps both the negotiation record (quotation) and the final billed document (invoice).
exports.createSampleFinalInvoice = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: orgId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const sample = lead.samples.id(req.params.sampleId);
  if (!sample) return sendError(res, 'Sample not found.', 404);
  if (!sample.invoiceId) return sendError(res, 'Create a quotation for this product first.', 400);
  if (sample.finalInvoiceId) return sendError(res, 'A final invoice already exists for this product.', 400);

  const quotation = await Invoice.findOne({ _id: sample.invoiceId, organizationId: orgId });
  if (!quotation) return sendError(res, 'Linked quotation not found.', 404);
  if (quotation.status === 'draft') return sendError(res, 'Send the quotation to the customer before creating the final invoice.', 422);
  if (quotation.status === 'cancelled') return sendError(res, 'This quotation was cancelled — rework it before invoicing.', 422);

  const invoice = await Invoice.create({
    organizationId: orgId,
    invoiceNumber: generateInvoiceNumber(),
    type: 'invoice',
    // Mirrors the quotation's real payment state as of right now — it isn't necessarily fully
    // paid just because the quotation was sent/confirmed.
    status: quotation.status,
    lead: lead._id,
    sampleId: sample._id,
    client: quotation.client,
    lineItems: quotation.lineItems,
    subtotal: quotation.subtotal,
    totalGst: quotation.totalGst,
    totalDiscount: quotation.totalDiscount,
    roundOff: quotation.roundOff,
    totalAmount: quotation.totalAmount,
    paidAmount: quotation.paidAmount,
    balanceAmount: quotation.totalAmount - quotation.paidAmount,
    paidDate: quotation.paidDate || undefined,
    notes: `Final invoice for quotation ${quotation.invoiceNumber}`,
    createdBy: req.user._id,
  });

  sample.finalInvoiceId = invoice._id;
  lead.updatedBy = req.user._id;
  await lead.save();

  // Let the client know their invoice is ready (async, non-blocking) — same pattern as every
  // other client-facing milestone in this file.
  const clientPhone = lead.whatsapp || lead.phone;
  if (clientPhone) {
    sendActiveClientStageUpdate(clientPhone, {
      name: lead.name,
      stage: lead.status,
      lastUpdate: `Your invoice ${invoice.invoiceNumber} for ₹${invoice.totalAmount.toLocaleString('en-IN')} is ready — we'll share the details shortly.`,
    }).catch(logger.error);
  }

  sendSuccess(res, { lead, invoice }, 'Invoice created', 201);
});

// POST /api/crm/leads/:id/samples/:sampleId/link-production  { catalogProduct, batchSizeKg }
// Per-product production hand-off, gated on THIS sample's own quotation being at least 50%
// paid — independent of every other product on the same lead. Creates its own ProductionOrder
// (a lead can now have several, one per paid product) rather than reusing the lead-wide
// productionOrderId, which stays reserved for the older whole-lead hand-off flow.
exports.linkSampleProduction = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { catalogProduct, batchSizeKg } = req.body;

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: orgId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const sample = lead.samples.id(req.params.sampleId);
  if (!sample) return sendError(res, 'Sample not found.', 404);
  if (sample.status !== 'Approved') return sendError(res, 'Only an approved sample can be sent to production.', 400);
  if (sample.productionOrderId) return sendError(res, 'This product is already linked to a production order.', 400);
  if (!catalogProduct) return sendError(res, 'Select a catalog product for this batch order.', 400);

  if (!sample.invoiceId) return sendError(res, 'Create a quotation for this product first.', 400);
  const invoice = await Invoice.findOne({ _id: sample.invoiceId, organizationId: orgId });
  if (!invoice) return sendError(res, 'Linked quotation not found.', 404);
  if (invoice.status === 'draft') return sendError(res, 'Send the quotation to the customer before sending this product to production.', 400);
  if (invoice.status === 'cancelled') return sendError(res, 'This quotation was cancelled — rework it before sending to production.', 400);
  // No advance-payment requirement here anymore — Customer Details (this order's stage 0) is
  // always freely editable regardless of stage/payment. The ≥50% gate now sits at the
  // Work Assignment save (stage 1 -> 2), which is the point real raw materials get committed —
  // see the '/:id/work-assignment' route in production.routes.js.

  const ProductionOrder = require('../models/ProductionOrder');
  const CatalogProduct = require('../models/CatalogProduct');
  const { PRODUCTION_STATUS, BATCH_PROCESS_STEPS } = require('../utils/constants');

  const catalogDoc = await CatalogProduct.findOne({ _id: catalogProduct, organizationId: orgId });
  if (!catalogDoc) return sendError(res, 'Catalog product not found.', 404);
  const ingredients = buildIngredientsFromCatalogProduct(catalogDoc, batchSizeKg);

  const count = await ProductionOrder.countDocuments({ organizationId: orgId });
  const order = await ProductionOrder.create({
    organizationId: orgId,
    orderNumber: `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
    batch: `BATCH-${Date.now()}`,
    status: PRODUCTION_STATUS.PLANNED,
    stage: 1,
    customer: lead.name,
    contact: lead.whatsapp || lead.phone,
    priority: lead.priority === 'critical' ? 'Urgent' : lead.priority === 'high' ? 'High' : lead.priority === 'low' ? 'Low' : 'Normal',
    // Same client-owner propagation, delivery estimate, and product-interest note as the
    // whole-lead link-production flow — see comments there. This per-product flow had fallen
    // out of parity with it (Customer Details showing blank instead of the KYC data already on
    // the lead), even though it's the one actually used from Approvals now.
    assignedTo: lead.inCharge || lead.assignedTo || undefined,
    deliveryDate: lead.inProgressAt && lead.leadTime
      ? new Date(new Date(lead.inProgressAt).getTime() + lead.leadTime * 86400000).toISOString().slice(0, 10)
      : undefined,
    notes: lead.productInterest?.length ? `Interest: ${lead.productInterest.join(', ')}` : undefined,
    batchSizeKg,
    leadId: lead._id,
    invoiceId: invoice._id,
    catalogProduct: catalogDoc._id,
    ingredients,
    processSteps: BATCH_PROCESS_STEPS.map((name) => ({ name, done: false })),
    createdBy: req.user._id,
  });

  sample.productionOrderId = order._id;
  // Mirrors linkProduction's lead.productionOrderId — the Approvals-tab filter and the
  // Orders table's "Order ID" column both key off this lead-level field, so without it a lead
  // stays stuck showing "awaiting" (and a blank Order ID) even after its first product's real
  // production order exists. First product linked wins; later products on the same lead keep
  // their own sample.productionOrderId regardless.
  if (!lead.productionOrderId) lead.productionOrderId = order._id;
  lead.updatedBy = req.user._id;
  await lead.save();

  req.app.get('io')?.to(`org:${orgId}`).emit('production_updated', { orderId: order._id, stage: order.stage, status: order.status });

  // Re-fetch populated (same shape as getLead) so the frontend can write this straight into its
  // cache and land on the Orders tab immediately — without this, samples.productionOrderId comes
  // back as a bare ObjectId and the newly created order's number/stage wouldn't display until a
  // separate refetch caught up.
  const populatedLead = await Lead.findOne({ _id: lead._id, organizationId: orgId })
    .populate('assignedTo', 'firstName lastName avatar phone')
    .populate('samples.invoiceId', 'invoiceNumber type status totalAmount paidAmount balanceAmount')
    .populate('samples.finalInvoiceId', 'invoiceNumber type status totalAmount paidAmount balanceAmount')
    .populate('samples.productionOrderId', 'orderNumber batch stage status');

  sendSuccess(res, { lead: populatedLead, order }, 'Product sent to production');
});

// GET /api/crm/production-orders/unlinked — for the "link existing order" picker
exports.getUnlinkedProductionOrders = asyncHandler(async (req, res) => {
  const ProductionOrder = require('../models/ProductionOrder');
  const orders = await ProductionOrder.find({ organizationId: req.user.organizationId, leadId: null })
    .select('orderNumber batch customer stage status createdAt')
    .sort({ createdAt: -1 })
    .limit(50);
  sendSuccess(res, { orders });
});

// POST /api/crm/leads/:id/dispatch  (multipart: note, file optional — image or video)
// Moves the lead to "Dispatched" and sends the client a detailed WhatsApp update (tracking,
// carrier, note). If a photo/video is attached, also attempts the media-header template —
// that template isn't Meta-approved yet, so it silently no-ops until it is; the text update
// above is the guaranteed message either way.
exports.dispatchLead = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const orgId = req.user.organizationId;

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: orgId }).populate('productionOrderId', 'orderNumber batch dispatchRecord');
  if (!lead) return sendError(res, 'Lead not found.', 404);
  if (lead.status === 'Dispatched') return sendError(res, 'This lead is already marked as Dispatched.', 400);

  const phone = lead.whatsapp || lead.phone;
  const product = lead.sampleDetails?.product || lead.productInterest?.[0] || 'your order';
  const dispatchRecord = lead.productionOrderId?.dispatchRecord;
  const trackingLine = dispatchRecord?.tracking
    ? `${dispatchRecord.carrier || 'Courier'} — ${dispatchRecord.tracking}`
    : (dispatchRecord?.carrier || null);

  let attachment = null;
  if (req.file) {
    const { uploadBuffer } = require('../utils/cloudinary');
    const isVideo = req.file.mimetype.startsWith('video/');
    const result = await uploadBuffer(req.file.buffer, { folder: `backero/crm/dispatch/${lead._id}`, resourceType: isVideo ? 'video' : 'image' });
    attachment = { url: result.secure_url, publicId: result.public_id, name: req.file.originalname, type: req.file.mimetype };
  }

  if (phone) {
    const detailParts = [];
    if (trackingLine) detailParts.push(`Tracking: ${trackingLine}`);
    if (note?.trim()) detailParts.push(note.trim());
    detailParts.push("We'd love to hear how it goes — reply anytime!");
    const lastUpdate = detailParts.join(' · ');

    sendActiveClientStageUpdate(phone, { name: lead.name, stage: 'Dispatched', lastUpdate }).catch((err) => logger.error(`dispatch stage update failed: ${err.message}`));

    if (attachment && (attachment.type.startsWith('image/') || attachment.type.startsWith('video/'))) {
      (async () => {
        try {
          const mediaId = await uploadMedia(req.file.buffer, req.file.originalname, attachment.type);
          if (mediaId) {
            await sendDispatchedWithMedia(phone, {
              name: lead.name, product, trackingLine, note: note?.trim(),
              mediaId, mediaType: attachment.type.startsWith('video/') ? 'video' : 'image',
            });
          }
        } catch (err) {
          logger.error(`dispatch media template failed (likely not yet Meta-approved): ${err.message}`);
        }
      })();
    }
  }

  if (attachment || note?.trim()) {
    lead.communicationLogs.push({
      type: 'other',
      title: 'Dispatch update sent to client',
      content: note?.trim() || '',
      images: attachment?.type.startsWith('image/') ? [{ url: attachment.url, publicId: attachment.publicId, name: attachment.name }] : [],
      videoFiles: attachment?.type.startsWith('video/') ? [{ url: attachment.url, publicId: attachment.publicId, name: attachment.name }] : [],
      addedBy: req.user._id,
    });
  }

  const now = new Date();
  const prevHistory = (lead.stageHistory || []).map((h) => ({ stage: h.stage, enteredAt: h.enteredAt, exitedAt: h.exitedAt, movedBy: h.movedBy }));
  if (!prevHistory.length) {
    prevHistory.push({ stage: lead.status, enteredAt: lead.createdAt, exitedAt: now, movedBy: req.user._id });
  } else {
    prevHistory[prevHistory.length - 1].exitedAt = now;
  }
  prevHistory.push({ stage: 'Dispatched', enteredAt: now, movedBy: req.user._id });

  lead.status = 'Dispatched';
  lead.stageHistory = prevHistory;
  lead.updatedBy = req.user._id;
  await lead.save();

  sendSuccess(res, { lead }, 'Marked as dispatched — client notified');
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
  lead.lastUpdateText = message.trim();
  lead.lastUpdateAt = new Date();
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
      $lookup: {
        from: 'productionorders',
        localField: 'productionOrderId',
        foreignField: '_id',
        as: 'productionOrderId',
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
        productionOrderId: {
          $let: {
            vars: { po: { $arrayElemAt: ['$productionOrderId', 0] } },
            in: { $cond: [{ $eq: ['$$po', null] }, null, { orderNumber: '$$po.orderNumber', batch: '$$po.batch', stage: '$$po.stage', status: '$$po.status' }] },
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
            isStale: '$isStale',
            lastContactedAt: '$lastContactedAt',
            pendingQueries: '$pendingQueries',
            answeredQueries: '$answeredQueries',
            answeredQueryList: '$answeredQueryList',
            productionOrderId: '$productionOrderId',
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

// GET /api/crm/leads/analytics/rep
exports.getRepAnalytics = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const now = new Date();

  const stats = await Lead.aggregate([
    { $match: { organizationId: orgId, assignedTo: { $ne: null } } },
    {
      $group: {
        _id: '$assignedTo',
        total: { $sum: 1 },
        won: { $sum: { $cond: [{ $eq: ['$status', 'Payment Pending'] }, 1, 0] } },
        lost: { $sum: { $cond: [{ $eq: ['$status', 'Lost'] }, 1, 0] } },
        stale: { $sum: { $cond: [{ $eq: ['$isStale', true] }, 1, 0] } },
        overdueFollowUp: {
          $sum: {
            $cond: [
              { $and: [
                { $lt: ['$nextFollowUpAt', now] },
                { $gt: ['$nextFollowUpAt', null] },
                { $not: [{ $in: ['$status', ['Payment Pending', 'Lost']] }] },
              ]}, 1, 0,
            ],
          },
        },
        totalValue: { $sum: { $ifNull: ['$estimatedValue', 0] } },
        wonValue: { $sum: { $cond: [{ $eq: ['$status', 'Payment Pending'] }, { $ifNull: ['$dealValue', '$estimatedValue', 0] }, 0] } },
      },
    },
    {
      $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $sort: { total: -1 } },
  ]);

  sendSuccess(res, { stats });
});

// GET /api/crm/leads/analytics/velocity
exports.getPipelineVelocity = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;

  const result = await Lead.aggregate([
    { $match: { organizationId: orgId, 'stageHistory.0': { $exists: true } } },
    { $unwind: '$stageHistory' },
    { $match: { 'stageHistory.exitedAt': { $exists: true, $ne: null } } },
    {
      $group: {
        _id: '$stageHistory.stage',
        avgDays: {
          $avg: {
            $divide: [
              { $subtract: ['$stageHistory.exitedAt', '$stageHistory.enteredAt'] },
              86400000,
            ],
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { avgDays: -1 } },
  ]);

  sendSuccess(res, { velocity: result });
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
  const { title, description, askedVia, urgency, topic, assignedTo, contactName, contactEmail, linkedCatalogProductId, targetPrice, benchmarkNotes, packagingIntent, internalNotes, answer } = req.body;
  if (!description) return sendError(res, 'Question is required', 400);

  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  // No separate "title" field in the raise-query composer (matches the reference design's
  // single Question box) — derive a short label for list/summary views from the question itself.
  const derivedTitle = (title || description).trim().slice(0, 80);
  const answeredNow = (answer || '').trim();

  const ProductionQuery = require('../models/ProductionQuery');
  // No explicit assignee on the query itself → default to the lead's production in-charge
  // (falling back to the narrower intake-rep assignedTo if in-charge was never set), so it
  // lands in the actual owner's Q&A Inbox instead of going out unassigned.
  const query = await ProductionQuery.create({
    organizationId: req.user.organizationId,
    leadId: lead._id,
    leadName: lead.name,
    raisedBy: req.user._id,
    assignedTo: assignedTo || lead.inCharge || lead.assignedTo || undefined,
    title: derivedTitle,
    description,
    askedVia: askedVia || 'Phone Call',
    urgency: urgency || 'medium',
    topic: topic || 'General',
    preQueryStatus: lead.status,
    contactName: contactName || undefined,
    contactEmail: contactEmail || undefined,
    linkedCatalogProductId: linkedCatalogProductId || undefined,
    targetPrice: targetPrice !== undefined ? Number(targetPrice) || 0 : undefined,
    benchmarkNotes: benchmarkNotes || undefined,
    packagingIntent: packagingIntent || undefined,
    internalNotes: internalNotes || undefined,
    // Logging the answer in the same step (reference design's "log Q&A in one shot") resolves
    // the query immediately instead of leaving it open for a separate reply.
    status: answeredNow ? 'answered' : 'pending',
    answer: answeredNow || undefined,
    answeredBy: answeredNow ? req.user._id : undefined,
    answeredAt: answeredNow ? new Date() : undefined,
  });

  // Sample/Production stage leads keep their status — "Query Pending" isn't a pipeline
  // column there, so flipping it would silently drop the lead out of the Sample Production
  // view for as long as the query stays open. New Lead/Follow-up leads instead promote
  // straight to Sample (via promoteToSampleIfNeeded) — raising a query is real Sample
  // Production activity too, and "Query Pending" isn't shown in the New Leads tab either,
  // so leaving it there would strand the lead nowhere visible. A query answered in the same
  // step never needs the Query Pending detour at all.
  if ([LEAD_STATUS.NEW, LEAD_STATUS.FOLLOWUP].includes(lead.status)) {
    await promoteToSampleIfNeeded(lead, req);
  } else if (!answeredNow && ![LEAD_STATUS.SAMPLE, LEAD_STATUS.IN_PROGRESS].includes(lead.status)) {
    lead.status = LEAD_STATUS.QUERY_PENDING;
  }
  lead.updatedBy = req.user._id;
  await lead.save();

  // Already answered in the same step — nobody needs to be paged to go answer it.
  if (!answeredNow) {
    // Notify only the assigned person (explicit, or the lead's production in-charge); if
    // neither, notify all production members
    const resolvedAssignee = assignedTo || lead.inCharge || lead.assignedTo;
    const recipientIds = resolvedAssignee
      ? [resolvedAssignee]
      : (await User.find({ organizationId: req.user.organizationId, department: 'Production' }).select('_id')).map(u => u._id);

    for (const recipientId of recipientIds) {
      await createNotification({
        organizationId: req.user.organizationId,
        recipient: recipientId,
        title: 'Technical Query from Sales',
        message: `"${derivedTitle}" — Lead: ${lead.name}. Urgency: ${urgency || 'medium'}`,
        type: 'crm',
        priority: urgency === 'high' ? 'high' : 'medium',
        actionUrl: '/crm/queries',
        reference: { model: 'ProductionQuery', id: query._id },
        channels: { inApp: true, whatsapp: true },
        createdBy: req.user._id,
      }, io);
    }

    // Let the client know their question has been received (async, non-blocking) —
    // promoteToSampleIfNeeded above already sends its own stage-change message when it
    // fires, so this is an additional, distinct "we're on it" acknowledgment.
    const clientPhone = lead.whatsapp || lead.phone;
    if (clientPhone) {
      sendActiveClientStageUpdate(clientPhone, {
        name: lead.name,
        stage: lead.status,
        lastUpdate: `We've received your question — "${derivedTitle}" — our team is reviewing it and will get back to you shortly.`,
      }).catch((err) => logger.error(err));
    }
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

  // Only the person this query is assigned to (its in-charge/owner) or a manager+ can reply —
  // an unassigned query stays open to anyone so it doesn't get stuck with nobody able to answer.
  const level = ROLE_HIERARCHY[req.user.role] || 1;
  if (query.assignedTo && String(query.assignedTo) !== String(req.user._id) && level < 3) {
    return sendError(res, 'Only the person this query is assigned to (or a manager) can reply.', 403);
  }

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

  // Let the client know their question has been answered — reuses the already-approved
  // client_stage_update template (free-text lastUpdate param carries the answer), same
  // pattern as production.routes.js's notifyClientMilestone.
  if (lead) {
    const clientPhone = lead.whatsapp || lead.phone;
    if (clientPhone) {
      sendActiveClientStageUpdate(clientPhone, {
        name: lead.name,
        stage: lead.status,
        lastUpdate: `We've answered your question — "${query.title}": ${answer}`,
      }).catch(logger.error);
    }
  }

  sendSuccess(res, { query }, 'Query answered');
});

// PUT /api/crm/queries/:queryId  { title?, description?, topic?, askedVia? }
// Edits the question itself after the fact — typos, more context, wrong topic/channel. Doesn't
// touch status/answer; that's answerQuery/updateQueryStatus's job.
exports.updateQuery = asyncHandler(async (req, res) => {
  const { title, description, topic, askedVia } = req.body;
  const ProductionQuery = require('../models/ProductionQuery');
  const query = await ProductionQuery.findOne({ _id: req.params.queryId, organizationId: req.user.organizationId });
  if (!query) return sendError(res, 'Query not found.', 404);

  if (description !== undefined) {
    if (!description.trim()) return sendError(res, 'Question is required', 400);
    query.description = description;
    if (title === undefined) query.title = description.trim().slice(0, 80);
  }
  if (title !== undefined) query.title = title.trim().slice(0, 80) || query.title;
  if (topic !== undefined) query.topic = topic;
  if (askedVia !== undefined) query.askedVia = askedVia;
  query.editedAt = new Date();

  await query.save();
  sendSuccess(res, { query }, 'Query updated');
});

// PUT /api/crm/queries/:queryId/delete  { deleted: boolean }
// Soft delete only — strikes the query through in the UI instead of removing the record, and is
// reversible (deleted: false) by clicking the same action again.
exports.setQueryDeleted = asyncHandler(async (req, res) => {
  const ProductionQuery = require('../models/ProductionQuery');
  const query = await ProductionQuery.findOne({ _id: req.params.queryId, organizationId: req.user.organizationId });
  if (!query) return sendError(res, 'Query not found.', 404);
  query.deleted = !!req.body.deleted;
  await query.save();
  sendSuccess(res, { query }, query.deleted ? 'Query deleted' : 'Query restored');
});

// POST /api/crm/queries/:queryId/attachment  (multipart 'file') — attaches to the question itself.
exports.uploadQueryAttachment = asyncHandler(async (req, res) => {
  const ProductionQuery = require('../models/ProductionQuery');
  const query = await ProductionQuery.findOne({ _id: req.params.queryId, organizationId: req.user.organizationId });
  if (!query) return sendError(res, 'Query not found.', 404);
  if (!req.file) return sendError(res, 'No file uploaded', 400);

  const { uploadBuffer } = require('../utils/cloudinary');
  const mime = req.file.mimetype || '';
  const resourceType = mime.startsWith('video/') || mime.startsWith('audio/') ? 'video' : mime.startsWith('image/') ? 'image' : 'raw';
  const result = await uploadBuffer(req.file.buffer, { folder: `backero/crm-queries/${req.user.organizationId}`, resourceType, filename: req.file.originalname });

  query.attachments = query.attachments || [];
  query.attachments.push({
    name: req.file.originalname,
    url: result.secure_url,
    type: mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('image/') ? 'image' : 'document',
  });
  await query.save();
  sendSuccess(res, { query }, 'Attachment uploaded');
});

// DELETE /api/crm/queries/:queryId/attachment  (body: { attachmentId })
exports.removeQueryAttachment = asyncHandler(async (req, res) => {
  const { attachmentId } = req.body;
  const ProductionQuery = require('../models/ProductionQuery');
  const query = await ProductionQuery.findOne({ _id: req.params.queryId, organizationId: req.user.organizationId });
  if (!query) return sendError(res, 'Query not found.', 404);

  query.attachments = (query.attachments || []).filter((a) => String(a._id) !== String(attachmentId));
  await query.save();
  sendSuccess(res, { query }, 'Attachment removed');
});

// POST /api/crm/queries/:queryId/reply-attachment  (multipart 'file') — attaches to the reply/answer.
exports.uploadQueryReplyAttachment = asyncHandler(async (req, res) => {
  const ProductionQuery = require('../models/ProductionQuery');
  const query = await ProductionQuery.findOne({ _id: req.params.queryId, organizationId: req.user.organizationId });
  if (!query) return sendError(res, 'Query not found.', 404);
  if (!req.file) return sendError(res, 'No file uploaded', 400);

  const { uploadBuffer } = require('../utils/cloudinary');
  const mime = req.file.mimetype || '';
  const resourceType = mime.startsWith('video/') || mime.startsWith('audio/') ? 'video' : mime.startsWith('image/') ? 'image' : 'raw';
  const result = await uploadBuffer(req.file.buffer, { folder: `backero/crm-queries/${req.user.organizationId}`, resourceType, filename: req.file.originalname });

  query.answerAttachments = query.answerAttachments || [];
  query.answerAttachments.push({
    name: req.file.originalname,
    url: result.secure_url,
    type: mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('image/') ? 'image' : 'document',
  });
  await query.save();
  sendSuccess(res, { query }, 'Attachment uploaded');
});

// DELETE /api/crm/queries/:queryId/reply-attachment  (body: { attachmentId })
exports.removeQueryReplyAttachment = asyncHandler(async (req, res) => {
  const { attachmentId } = req.body;
  const ProductionQuery = require('../models/ProductionQuery');
  const query = await ProductionQuery.findOne({ _id: req.params.queryId, organizationId: req.user.organizationId });
  if (!query) return sendError(res, 'Query not found.', 404);

  query.answerAttachments = (query.answerAttachments || []).filter((a) => String(a._id) !== String(attachmentId));
  await query.save();
  sendSuccess(res, { query }, 'Attachment removed');
});

// PUT /api/crm/queries/:queryId/status  { status: 'in_progress' | 'closed' }
// Plain status flips that don't need an answer — Open → In Progress (start working on it) and
// Answered → Closed (customer satisfied). Answering itself goes through answerQuery above.
exports.updateQueryStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const ProductionQuery = require('../models/ProductionQuery');
  const query = await ProductionQuery.findOne({ _id: req.params.queryId, organizationId: req.user.organizationId });
  if (!query) return sendError(res, 'Query not found.', 404);

  if (status === 'in_progress' && query.status === 'pending') query.status = 'in_progress';
  else if (status === 'closed' && query.status === 'answered') query.status = 'closed';
  else return sendError(res, 'Invalid status transition.', 400);

  await query.save();
  sendSuccess(res, { query }, 'Query status updated');
});

// PUT /api/crm/queries/:queryId/link  { productLinkId?, convertedTo? }
// Stamps the "product first" gate and/or the conversion badge onto a query once the Q&A tab's
// convert-to-action icons (🆕/🔗/🧪/🧬) actually create/link something for it.
exports.linkQuery = asyncHandler(async (req, res) => {
  const { productLinkId, convertedTo } = req.body;
  const ProductionQuery = require('../models/ProductionQuery');
  const query = await ProductionQuery.findOne({ _id: req.params.queryId, organizationId: req.user.organizationId });
  if (!query) return sendError(res, 'Query not found.', 404);

  if (productLinkId) query.linkedProductLinkId = productLinkId;
  if (convertedTo) query.convertedTo = convertedTo;
  await query.save();
  sendSuccess(res, { query }, 'Query updated');
});

// POST /api/crm/leads/:id/comm-log  (multipart/form-data — images optional)
exports.addCommLog = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const { type = 'call', title = '', content = '', happenedAt } = req.body;
  const { uploadBuffer } = require('../utils/cloudinary');

  // Upload images, audio and video to Cloudinary
  const images = [];
  const audioFiles = [];
  const videoFiles = [];
  if (req.files?.length) {
    for (const file of req.files) {
      if (file.mimetype.startsWith('audio/')) {
        const result = await uploadBuffer(file.buffer, { folder: `backero/comm-logs/${req.params.id}`, resourceType: 'video' });
        audioFiles.push({ url: result.secure_url, publicId: result.public_id, name: file.originalname });
      } else if (file.mimetype.startsWith('video/')) {
        const result = await uploadBuffer(file.buffer, { folder: `backero/comm-logs/${req.params.id}`, resourceType: 'video' });
        videoFiles.push({ url: result.secure_url, publicId: result.public_id, name: file.originalname });
      } else {
        const result = await uploadBuffer(file.buffer, { folder: `backero/comm-logs/${req.params.id}` });
        images.push({ url: result.secure_url, publicId: result.public_id, name: file.originalname });
      }
    }
  }

  const logEntry = {
    type,
    title: title.trim(),
    content: content.trim(),
    happenedAt: happenedAt ? new Date(happenedAt) : new Date(),
    images,
    audioFiles,
    videoFiles,
    addedBy: req.user._id,
    createdAt: new Date(),
  };

  lead.communicationLogs.push(logEntry);
  await lead.save({ validateBeforeSave: false });

  const populated = await Lead.findById(lead._id)
    .populate('communicationLogs.addedBy', 'firstName lastName');

  sendSuccess(res, { log: populated.communicationLogs.at(-1) }, 'Communication log added');
});

// PUT /api/crm/leads/:id/comm-log/:logId  (admin only)
exports.editCommLog = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);
  const log = lead.communicationLogs.id(req.params.logId);
  if (!log) return sendError(res, 'Log not found.', 404);
  const { type, content } = req.body;
  if (type) log.type = type;
  if (content !== undefined) log.content = content;
  await lead.save({ validateBeforeSave: false });
  sendSuccess(res, { log }, 'Log updated');
});

// DELETE /api/crm/leads/:id/comm-log/:logId  (admin only)
exports.deleteCommLog = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);
  const log = lead.communicationLogs.id(req.params.logId);
  if (!log) return sendError(res, 'Log not found.', 404);
  log.deleteOne();
  await lead.save({ validateBeforeSave: false });
  sendSuccess(res, {}, 'Log deleted');
});

exports.createSampleInvoice = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!lead) return sendError(res, 'Lead not found.', 404);

  const sd = lead.sampleDetails;
  const chargeAmount = Number(sd?.chargeAmount) || 0;
  if (chargeAmount <= 0) return sendError(res, 'Sample charge amount must be greater than 0.', 400);
  if (sd?.sampleInvoiceId) return sendError(res, 'Invoice already created for this sample.', 400);

  const productDesc = sd?.product ? `Sample - ${sd.product}` : 'Sample Product';
  const qty = Number(sd?.quantity) || 1;
  const unitPrice = chargeAmount;
  const gstRate = 0;
  const itemTotal = qty * unitPrice;

  const invoiceStatus = sd?.paymentStatus === 'full_paid' ? 'paid' : sd?.paymentStatus === 'advance_received' ? 'partially_paid' : 'draft';

  const invoice = await Invoice.create({
    organizationId: req.user.organizationId,
    invoiceNumber: generateInvoiceNumber(),
    type: 'invoice',
    status: invoiceStatus,
    client: {
      name: lead.name,
      email: lead.email || '',
      phone: lead.phone || '',
      address: [lead.city, lead.state].filter(Boolean).join(', '),
    },
    lead: lead._id,
    lineItems: [{ description: productDesc, quantity: qty, unit: 'pcs', unitPrice, gstRate, gstAmount: 0, discount: 0, total: itemTotal }],
    subtotal: itemTotal,
    totalGst: 0,
    totalDiscount: 0,
    totalAmount: itemTotal,
    paidAmount: invoiceStatus === 'paid' ? itemTotal : (Number(sd?.advanceAmount) || 0),
    balanceAmount: invoiceStatus === 'paid' ? 0 : itemTotal - (Number(sd?.advanceAmount) || 0),
    issueDate: new Date(),
    notes: `Sample invoice for lead: ${lead.name}`,
    createdBy: req.user._id,
  });

  lead.sampleDetails.sampleInvoiceId = invoice._id;
  await lead.save({ validateBeforeSave: false });

  sendSuccess(res, { invoice }, 'Sample invoice created');
});

