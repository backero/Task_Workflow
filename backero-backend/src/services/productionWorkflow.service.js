const Lead = require('../models/Lead');
const { BATCH_STAGE_TO_STATUS } = require('../utils/constants');
const { sendActiveClientStageUpdate } = require('./whatsappCloud.service');
const logger = require('../utils/logger');

// If this batch order is linked to a CRM lead, ping the client with a short
// milestone update — reuses the already-approved client_stage_update template
// (its free-text `lastUpdate` param carries the specific milestone).
// Shared by production.routes.js and productionSchedule.routes.js so both the
// Batch Tracker's own Work Assignment step and the Kitchen Schedule's "Confirm"
// action send the identical client-facing message.
async function notifyClientMilestone(order, milestoneText) {
  if (!order.leadId) return;
  try {
    const lead = await Lead.findById(order.leadId).select('name phone whatsapp status');
    if (!lead) return;
    const phone = lead.whatsapp || lead.phone;
    if (!phone) return;
    const fullUpdate = order.deliveryDate ? `${milestoneText} Expected delivery: ${order.deliveryDate}.` : milestoneText;
    await sendActiveClientStageUpdate(phone, { name: lead.name, stage: lead.status, lastUpdate: fullUpdate });
  } catch (err) {
    logger.error(`[ProductionMilestone] notify failed: ${err.message}`);
  }
}

// Emits the same 'production_updated' socket event both the Batch Tracker board
// and the Kitchen Schedule module listen for.
function notifyStageChange(req, order) {
  req.app.get('io')?.to(`org:${req.user.organizationId}`).emit('production_updated', { orderId: order._id, stage: order.stage, status: order.status });
}

// Merges a partial work-assignment patch onto the order and advances stage 1 -> 2
// exactly the way the Batch Tracker's PATCH /production/:id/work-assignment does.
// Does NOT save the order or send notifications — callers own the save + notify
// step so they can add their own audit trail around it first.
function applyWorkAssignment(order, patch, userId) {
  order.workAssignment = { ...(order.workAssignment?.toObject?.() || order.workAssignment || {}), ...patch };
  const advanced = order.stage === 1;
  if (advanced) {
    order.stage = 2;
    order.status = BATCH_STAGE_TO_STATUS[2];
  }
  order.updatedBy = userId;
  return advanced;
}

module.exports = { notifyClientMilestone, notifyStageChange, applyWorkAssignment };
