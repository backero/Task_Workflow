const Lead = require('../models/Lead');
const ScheduleWeek = require('../models/ScheduleWeek');
const { BATCH_STAGE_TO_STATUS } = require('../utils/constants');
const { sendActiveClientStageUpdate } = require('./whatsappCloud.service');
const logger = require('../utils/logger');

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

// Same ISO-8601 (Monday-start) week-key algorithm as KitchenSchedule.jsx's weekKeyOf — must
// match exactly so a server-created slot lands in the week the frontend actually requests.
function weekKeyOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNo = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;
}

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

// Builds this order's traceability ID for the stage it's about to enter, e.g.
// "PO-2026-0013-PROC" — same order number every stage shares, suffixed per stage so each
// still reads as its own reference on QC paperwork/labels.
function stageId(order, suffix) {
  return `${order.orderNumber}-${suffix}`;
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
    order.procurementId = stageId(order, 'PROC');
  }
  order.updatedBy = userId;
  return advanced;
}

// Called right after applyWorkAssignment advances an order 1 -> 2, so it shows up on the
// Kitchen Schedule board even when the schedule was never touched directly (staff can also
// confirm work assignment from the order's own Customer Details tab, bypassing Kitchen
// Schedule's own Tray -> slot flow entirely). No-ops if a live slot for this order already
// exists anywhere, or if the target date+slot is already taken (manual placement wins —
// this only fills the gap when nobody scheduled it at all). Never throws — a scheduling
// hiccup here shouldn't block the work-assignment save that triggered it.
async function ensureScheduleSlot(order, userId) {
  try {
    const alreadyScheduled = await ScheduleWeek.exists({
      organizationId: order.organizationId,
      slots: { $elemMatch: { productionOrderId: order._id, status: { $ne: 'Removed' } } },
    });
    if (alreadyScheduled) return;

    const dateStr = order.workAssignment?.startDate || toDateStr(new Date());
    const weekKey = weekKeyOf(new Date(dateStr));

    let week = await ScheduleWeek.findOne({ organizationId: order.organizationId, weekKey });
    if (!week) week = await ScheduleWeek.create({ organizationId: order.organizationId, weekKey, slots: [], blocks: [], auditLog: [] });

    const takenSlots = new Set(week.slots.filter((s) => s.date === dateStr && s.status !== 'Removed').map((s) => s.slot));
    const slot = !takenSlots.has('AM') ? 'AM' : !takenSlots.has('PM') ? 'PM' : null;
    if (!slot) return;

    week.slots.push({
      date: dateStr, slot, productionOrderId: order._id,
      leader: order.assignedTo || undefined,
      support: [],
      status: 'Planned',
      createdAt: new Date(),
      createdBy: userId,
    });
    week.auditLog.push({ at: new Date(), byUserId: userId, change: `Auto-placed ${order.orderNumber} into ${dateStr} ${slot} (work assignment confirmed outside Kitchen Schedule)` });
    await week.save();
  } catch (err) {
    logger.error(`[KitchenSchedule] auto-place failed for order ${order._id}: ${err.message}`);
  }
}

module.exports = { notifyClientMilestone, notifyStageChange, applyWorkAssignment, stageId, ensureScheduleSlot };
