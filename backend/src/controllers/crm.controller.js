const Lead            = require('../models/Lead');
const Organization    = require('../models/Organization');
const LeadActivity    = require('../models/LeadActivity');
const FollowUpQueue   = require('../models/FollowUpQueue');
const ProductionOrder = require('../models/ProductionOrder');
const User            = require('../models/User');
const { fetchLeadsFromSheet, fetchFromPublicUrl, fetchFromCSVBuffer, isConfigured } = require('../services/googleSheets.service');
const { scheduleFollowUps, cancelFollowUps }  = require('../services/crmFollowUp.service');
const { sendCrmMessage }  = require('../services/whatsapp.service');
const { success, created, badRequest, notFound, error: serverError } = require('../utils/response');
const { log }             = require('../services/activityLog.service');
const { emitToOrg }       = require('../sockets');
const logger              = require('../utils/logger');

const STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];

const normalizePhone = (phone) => {
  let p = String(phone).replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (!p.startsWith('+')) p = '+91' + p.replace(/^0+/, '');
  return p;
};

/* ── Log to LeadActivity (never throws) ─────────────────────────────────────── */
const logActivity = async (leadId, orgId, type, description, by = null, meta = {}) => {
  try {
    await LeadActivity.create({ leadId, organizationId: orgId, type, description, by, meta });
  } catch (e) {
    logger.error(`LeadActivity write failed: ${e.message}`);
  }
};

/* ── Check org follow-up setting ────────────────────────────────────────────── */
const isFollowUpEnabled = async (orgId) => {
  const org = await Organization.findById(orgId).select('crm').lean();
  return org?.crm?.followUpEnabled !== false;
};

/* ── List leads (table view) ────────────────────────────────────────────────── */
const getLeads = async (req, res) => {
  const orgId = req.user.organizationId;
  const { stage, assignedTo, search, page = 1, limit = 50 } = req.query;
  try {
    const query = { organizationId: orgId };
    if (stage)      query.stage      = stage;
    if (assignedTo) query.assignedTo = assignedTo;
    if (search) {
      query.$or = [
        { name:    { $regex: search, $options: 'i' } },
        { phone:   { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { email:   { $regex: search, $options: 'i' } },
      ];
    }
    const [leads, total] = await Promise.all([
      Lead.find(query)
        .populate('assignedTo', 'name phone')
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit)),
      Lead.countDocuments(query),
    ]);
    return success(res, { leads, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error(`getLeads: ${err.message}`);
    return serverError(res, err.message);
  }
};

/* ── Kanban grouped by stage ────────────────────────────────────────────────── */
const getKanban = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const leads = await Lead.find({ organizationId: orgId })
      .populate('assignedTo', 'name phone')
      .sort({ updatedAt: -1 });

    const kanban = Object.fromEntries(STAGES.map(s => [s, []]));
    leads.forEach(l => { if (kanban[l.stage]) kanban[l.stage].push(l); });

    const stats = {
      total: leads.length,
      won:   kanban.Won.length,
      lost:  kanban.Lost.length,
      totalValue: leads.filter(l => l.stage === 'Won').reduce((s, l) => s + (l.value || 0), 0),
    };

    return success(res, { kanban, stats });
  } catch (err) {
    logger.error(`getKanban: ${err.message}`);
    return serverError(res, err.message);
  }
};

/* ── Single lead ────────────────────────────────────────────────────────────── */
const getLead = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const lead = await Lead.findOne({ _id: req.params.id, organizationId: orgId })
      .populate('assignedTo', 'name phone');
    if (!lead) return notFound(res, 'Lead not found');
    return success(res, { lead });
  } catch (err) {
    return serverError(res, err.message);
  }
};

/* ── Lead activity timeline ─────────────────────────────────────────────────── */
const getLeadActivity = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const lead = await Lead.findOne({ _id: req.params.id, organizationId: orgId }).lean();
    if (!lead) return notFound(res, 'Lead not found');

    const [activities, pendingCount] = await Promise.all([
      LeadActivity.find({ leadId: req.params.id })
        .populate('by', 'name')
        .sort({ createdAt: -1 })
        .limit(100),
      FollowUpQueue.countDocuments({ leadId: req.params.id, status: 'pending' }),
    ]);
    return success(res, { activities, pendingFollowUps: pendingCount });
  } catch (err) {
    return serverError(res, err.message);
  }
};

/* ── Create lead manually ───────────────────────────────────────────────────── */
const createLead = async (req, res) => {
  const orgId = req.user.organizationId;
  const { name, phone, email, company, query, stage, value, notes, assignedTo } = req.body;
  if (!name || !phone) return badRequest(res, 'Name and phone are required');
  try {
    const normalized = normalizePhone(phone);
    const existing = await Lead.findOne({ organizationId: orgId, phone: normalized });
    if (existing) return badRequest(res, 'A lead with this phone number already exists');

    const finalStage = stage || 'New';
    const lead = await Lead.create({
      name, phone: normalized, email: email || null, company: company || null,
      query: query || null, stage: finalStage, value: value || 0,
      notes: notes || null, assignedTo: assignedTo || null,
      source: 'Manual', organizationId: orgId,
    });

    await log({ userId: req.user._id, organizationId: orgId, action: 'CRM_LEAD_CREATED', entity: 'Lead', entityId: lead._id });
    await logActivity(lead._id, orgId, 'created', `Lead created manually by ${req.user.name || 'user'}`, req.user._id);

    // Schedule follow-up sequence (day 0 included for manual leads)
    if (await isFollowUpEnabled(orgId)) {
      scheduleFollowUps(lead, finalStage).catch(e => logger.error(`[FollowUp schedule] ${e.message}`));
    }

    emitToOrg(orgId.toString(), 'crm:lead_created', { lead });
    return created(res, { lead }, 'Lead created');
  } catch (err) {
    logger.error(`createLead: ${err.message}`);
    return serverError(res, err.message);
  }
};

/* ── Trigger all stage-change side-effects ──────────────────────────────────── */
const _onStageChange = async (lead, oldStage, newStage, byUserId, orgId) => {
  await logActivity(lead._id, orgId, 'stage_change',
    `Stage changed: ${oldStage} → ${newStage}`, byUserId, { oldStage, newStage });

  if (await isFollowUpEnabled(orgId)) {
    const skipDay0 = true; // manual stage change — skip instant message
    scheduleFollowUps(lead, newStage, skipDay0).catch(e => logger.error(`[FollowUp] ${e.message}`));
  }

  // Won → create draft production order + notify manager
  if (newStage === 'Won') {
    await cancelFollowUps(lead._id);
    try {
      const orderNumber = `CRM-${Date.now().toString(36).toUpperCase()}`;
      const po = await ProductionOrder.create({
        organizationId: orgId,
        orderNumber,
        name:           `Order — ${lead.name}`,
        outputQuantity: 1,
        outputUnit:     'pcs',
        status:         'draft',
        notes:          `Auto-created from CRM. Customer: ${lead.name} (${lead.phone})${lead.query ? '. Query: ' + lead.query : ''}`,
        createdBy:      byUserId || null,
      });
      await logActivity(lead._id, orgId, 'production_created',
        `Draft production order created: ${orderNumber}`, byUserId, { orderNumber, productionOrderId: po._id });

      // Notify manager / admin
      const manager = await User.findOne({
        organizationId: orgId,
        role: { $in: ['ADMIN', 'OWNER', 'MANAGER'] },
      }).select('phone name').lean();
      if (manager?.phone) {
        await sendCrmMessage(manager.phone,
          `🏆 *New Won Lead!*\n\nCustomer: *${lead.name}*\nPhone: ${lead.phone}${lead.company ? '\nCompany: ' + lead.company : ''}${lead.value ? '\nDeal Value: ₹' + Number(lead.value).toLocaleString('en-IN') : ''}\n\n📋 Draft production order *${orderNumber}* has been created.\n\n— Backero CRM`
        ).catch(() => {});
      }
    } catch (e) {
      logger.error(`[Won] Production order creation failed: ${e.message}`);
    }
  }

  // Qualified → notify assignee
  if (newStage === 'Qualified' && lead.assignedTo) {
    const assignee = await User.findById(lead.assignedTo).select('phone name').lean();
    if (assignee?.phone) {
      await sendCrmMessage(assignee.phone,
        `🎯 *Qualified Lead Assigned*\n\nHi ${assignee.name?.split(' ')[0] || 'there'}!\n\nLead *${lead.name}* has been qualified and is assigned to you.\n📞 ${lead.phone}${lead.company ? '\n🏢 ' + lead.company : ''}${lead.query ? '\n💬 ' + lead.query : ''}\n\nFollow up soon!\n\n— Backero CRM`
      ).catch(() => {});
    }
  }
};

/* ── Update lead (stage, notes, assignee, value…) ──────────────────────────── */
const updateLead = async (req, res) => {
  const orgId  = req.user.organizationId;
  const { id } = req.params;
  const allowed = ['name', 'email', 'company', 'query', 'stage', 'value', 'notes', 'assignedTo', 'tags', 'lastContactedAt'];
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  );
  try {
    const old = await Lead.findOne({ _id: id, organizationId: orgId }).lean();
    if (!old) return notFound(res, 'Lead not found');

    const lead = await Lead.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: updates },
      { new: true }
    ).populate('assignedTo', 'name phone');

    // Log activity for specific changes
    if (updates.stage && updates.stage !== old.stage) {
      _onStageChange(lead.toObject(), old.stage, updates.stage, req.user._id, orgId).catch(() => {});
    }
    if (updates.notes && updates.notes !== old.notes) {
      logActivity(lead._id, orgId, 'note_added', 'Notes updated', req.user._id).catch(() => {});
    }
    if (updates.value !== undefined && updates.value !== old.value) {
      logActivity(lead._id, orgId, 'value_changed',
        `Deal value updated: ₹${old.value || 0} → ₹${updates.value}`, req.user._id).catch(() => {});
    }
    if (updates.assignedTo && String(updates.assignedTo) !== String(old.assignedTo)) {
      const assignee = await User.findById(updates.assignedTo).select('name phone').lean();
      logActivity(lead._id, orgId, 'assigned',
        `Assigned to ${assignee?.name || 'user'}`, req.user._id).catch(() => {});
      if (assignee?.phone) {
        sendCrmMessage(assignee.phone,
          `📋 *Lead Assigned to You*\n\nHi ${assignee.name?.split(' ')[0] || 'there'}!\n\n*${lead.name}* (${lead.stage})\n📞 ${lead.phone}${lead.company ? '\n🏢 ' + lead.company : ''}\n\n— Backero CRM`
        ).catch(() => {});
      }
    }

    emitToOrg(orgId.toString(), 'crm:lead_updated', { lead });
    return success(res, { lead }, 'Lead updated');
  } catch (err) {
    logger.error(`updateLead: ${err.message}`);
    return serverError(res, err.message);
  }
};

/* ── Delete lead ────────────────────────────────────────────────────────────── */
const deleteLead = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const lead = await Lead.findOneAndDelete({ _id: req.params.id, organizationId: orgId });
    if (!lead) return notFound(res, 'Lead not found');
    await cancelFollowUps(req.params.id).catch(() => {});
    emitToOrg(orgId.toString(), 'crm:lead_deleted', { leadId: req.params.id });
    return success(res, {}, 'Lead deleted');
  } catch (err) {
    return serverError(res, err.message);
  }
};

/* ── Send WhatsApp to a lead ────────────────────────────────────────────────── */
const sendWhatsApp = async (req, res) => {
  const orgId = req.user.organizationId;
  const { id } = req.params;
  const { message } = req.body;
  if (!message?.trim()) return badRequest(res, 'Message cannot be empty');
  try {
    const lead = await Lead.findOne({ _id: id, organizationId: orgId });
    if (!lead) return notFound(res, 'Lead not found');

    const result = await sendCrmMessage(lead.phone, message.trim());

    if (!result.success) {
      const reason = result.error === 'connection_timeout'
        ? 'WhatsApp is not connected. Open /api/whatsapp/qr in a browser to scan the QR code.'
        : result.error === 'local client not loaded'
        ? 'WhatsApp provider is not active. Set WHATSAPP_PROVIDER=local in .env and restart.'
        : `WhatsApp send failed: ${result.error || 'unknown error'}`;
      return badRequest(res, reason);
    }

    const updates = { lastContactedAt: new Date() };
    if (lead.stage === 'New') updates.stage = 'Contacted';
    Object.assign(lead, updates);
    await lead.save();

    await logActivity(lead._id, orgId, 'whatsapp_sent',
      `WhatsApp sent: "${message.trim().substring(0, 60)}${message.length > 60 ? '…' : ''}"`,
      req.user._id, { message: message.trim() });

    emitToOrg(orgId.toString(), 'crm:lead_updated', { lead });
    return success(res, { result }, 'WhatsApp message sent');
  } catch (err) {
    logger.error(`CRM sendWhatsApp: ${err.message}`);
    return serverError(res, err.message);
  }
};

/* ── Bulk WhatsApp to multiple leads ────────────────────────────────────────── */
const bulkWhatsApp = async (req, res) => {
  const orgId = req.user.organizationId;
  const { leadIds, message } = req.body;
  if (!message?.trim())        return badRequest(res, 'Message cannot be empty');
  if (!leadIds?.length)        return badRequest(res, 'No leads selected');
  if (leadIds.length > 100)    return badRequest(res, 'Max 100 leads per bulk send');

  try {
    const leads = await Lead.find({ _id: { $in: leadIds }, organizationId: orgId }).lean();
    let sent = 0, failed = 0;

    for (const lead of leads) {
      try {
        await sendCrmMessage(lead.phone, message.trim());
        await Lead.findByIdAndUpdate(lead._id, { lastContactedAt: new Date() });
        await logActivity(lead._id, orgId, 'bulk_whatsapp',
          `Bulk WhatsApp sent: "${message.trim().substring(0, 60)}…"`,
          req.user._id, { message: message.trim() });
        sent++;
      } catch {
        failed++;
      }
      await new Promise(r => setTimeout(r, 3000)); // rate limit
    }

    emitToOrg(orgId.toString(), 'crm:bulk_sent', { sent, failed });
    return success(res, { sent, failed }, `Sent to ${sent} leads${failed ? `, ${failed} failed` : ''}`);
  } catch (err) {
    logger.error(`bulkWhatsApp: ${err.message}`);
    return serverError(res, err.message);
  }
};

/* ── Shared DB-write logic for all import sources ───────────────────────────── */
const _syncRows = async (orgId, rows, source = 'GoogleSheet', noPhone = 0) => {
  let added = 0, updated = 0, skipped = noPhone; // start skipped count with rows missing phone
  const followUp = await isFollowUpEnabled(orgId);

  for (const row of rows) {
    if (!row.phone) { skipped++; continue; }
    const phone = normalizePhone(row.phone);

    const existing = await Lead.findOne({ organizationId: orgId, phone });
    if (existing) {
      const patch = {};
      if (!existing.email   && row.email)   patch.email   = row.email;
      if (!existing.company && row.company) patch.company = row.company;
      if (!existing.query   && row.query)   patch.query   = row.query;
      if (Object.keys(patch).length) {
        await Lead.updateOne({ _id: existing._id }, { $set: patch });
        updated++;
      } else {
        skipped++;
      }
    } else {
      const lead = await Lead.create({
        name: row.name || 'Unknown', phone,
        email: row.email || null, company: row.company || null,
        query: row.query || null, source, sheetRowId: row.sheetRowId,
        organizationId: orgId,
      });
      await logActivity(lead._id, orgId, 'created', `Lead imported from ${source}`);
      // Skip day-0 welcome for bulk imports — start sequence from day 2
      if (followUp) {
        scheduleFollowUps(lead, 'New', true).catch(() => {});
      }
      added++;
    }
  }

  return { added, updated, skipped };
};

/* ── Sync from service account API ─────────────────────────────────────────── */
const syncFromSheet = async (req, res) => {
  const orgId = req.user.organizationId;
  if (!isConfigured()) {
    return badRequest(res, 'Google Sheets not configured. Add GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY to .env');
  }
  try {
    const result = await runSheetSync(orgId);
    emitToOrg(orgId.toString(), 'crm:synced', result);
    return success(res, result, `Sync complete — ${result.added} new, ${result.updated} updated, ${result.skipped} skipped`);
  } catch (err) {
    logger.error(`syncFromSheet: ${err.message}`);
    return serverError(res, `Sync failed: ${err.message}`);
  }
};

/* ── Sync from a public Google Sheet URL ────────────────────────────────────── */
const syncFromUrl = async (req, res) => {
  const orgId = req.user.organizationId;
  const { sheetUrl } = req.body;
  if (!sheetUrl?.trim()) return badRequest(res, 'sheetUrl is required');
  try {
    const { leads, noPhone } = await fetchFromPublicUrl(sheetUrl.trim());
    const { added, updated, skipped } = await _syncRows(orgId, leads, 'GoogleSheet', noPhone);
    const msg = `Sync complete — ${added} new, ${updated} updated, ${skipped} skipped${noPhone ? ` (${noPhone} rows had no phone number)` : ''}`;
    emitToOrg(orgId.toString(), 'crm:synced', { added, updated, skipped });
    return success(res, { added, updated, skipped, noPhone }, msg);
  } catch (err) {
    logger.error(`syncFromUrl: ${err.message}`);
    return serverError(res, err.message);
  }
};

/* ── Import from uploaded CSV ───────────────────────────────────────────────── */
const importCsv = async (req, res) => {
  const orgId = req.user.organizationId;
  if (!req.file) return badRequest(res, 'No CSV file uploaded');
  try {
    const { leads, noPhone } = fetchFromCSVBuffer(req.file.buffer);
    const { added, updated, skipped } = await _syncRows(orgId, leads, 'Import', noPhone);
    const msg = `Import complete — ${added} new, ${updated} updated, ${skipped} skipped${noPhone ? ` (${noPhone} rows had no phone number)` : ''}`;
    emitToOrg(orgId.toString(), 'crm:synced', { added, updated, skipped });
    return success(res, { added, updated, skipped, noPhone }, msg);
  } catch (err) {
    logger.error(`importCsv: ${err.message}`);
    return serverError(res, err.message);
  }
};

/* ── CRM settings ───────────────────────────────────────────────────────────── */
const getCrmSettings = async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId).select('crm').lean();
    return success(res, { crm: org?.crm || {} });
  } catch (err) { return serverError(res, err.message); }
};

const saveCrmSettings = async (req, res) => {
  const orgId = req.user.organizationId;
  const { sheetUrl, autoSync, followUpEnabled } = req.body;
  try {
    const update = {};
    if (sheetUrl        !== undefined) update['crm.sheetUrl']        = sheetUrl?.trim() || null;
    if (autoSync        !== undefined) update['crm.autoSync']        = Boolean(autoSync);
    if (followUpEnabled !== undefined) update['crm.followUpEnabled'] = Boolean(followUpEnabled);
    const org = await Organization.findByIdAndUpdate(orgId, { $set: update }, { new: true }).select('crm');
    return success(res, { crm: org.crm }, 'CRM settings saved');
  } catch (err) { return serverError(res, err.message); }
};

/* ── Cron: service account sync ─────────────────────────────────────────────── */
const runSheetSync = async (orgId) => {
  const { leads, noPhone } = await fetchLeadsFromSheet();
  const result = await _syncRows(orgId, leads, 'GoogleSheet', noPhone);
  if (result.added > 0 || result.updated > 0) {
    emitToOrg(orgId.toString(), 'crm:synced', result);
  }
  logger.info(`[GSheet Sync] org:${orgId} — added:${result.added} updated:${result.updated} skipped:${result.skipped}`);
  return result;
};

/* ── Cron: public URL sync ──────────────────────────────────────────────────── */
const runUrlSync = async (orgId, sheetUrl) => {
  const { leads, noPhone } = await fetchFromPublicUrl(sheetUrl);
  const result = await _syncRows(orgId, leads, 'GoogleSheet', noPhone);
  await Organization.findByIdAndUpdate(orgId, { $set: { 'crm.lastSyncAt': new Date() } });
  if (result.added > 0 || result.updated > 0) {
    emitToOrg(orgId.toString(), 'crm:synced', result);
  }
  logger.info(`[URL Sync] org:${orgId} — added:${result.added} updated:${result.updated} skipped:${result.skipped}`);
  return result;
};

module.exports = {
  getLeads, getKanban, getLead, getLeadActivity,
  createLead, updateLead, deleteLead,
  sendWhatsApp, bulkWhatsApp,
  syncFromSheet, syncFromUrl, importCsv,
  getCrmSettings, saveCrmSettings,
  runSheetSync, runUrlSync,
};
