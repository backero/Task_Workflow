const mongoose = require('mongoose');
const router = require('express').Router();
const ScheduleWeek = require('../models/ScheduleWeek');
const ProductionOrder = require('../models/ProductionOrder');
const Product = require('../models/Product');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeManagerOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const { applyWorkAssignment, notifyStageChange, notifyClientMilestone } = require('../services/productionWorkflow.service');

router.use(authenticate, orgIsolation);

const BLOCK_CYCLE = ['RD', 'Client', 'Docs', 'Leave'];

// User ids already leader/support on some OTHER non-Removed slot on this date (AM or PM —
// only one order can occupy a given date+slot at all, so "double-booked" has to mean
// "already got a batch that day", not the exact same slot). excludeSlotId lets a slot's own
// edit ignore itself.
function getBusyUserIds(week, date, excludeSlotId) {
  const busy = new Set();
  week.slots.forEach((s) => {
    if (s.status === 'Removed') return;
    if (excludeSlotId && String(s._id) === String(excludeSlotId)) return;
    if (s.date !== date) return;
    if (s.leader) busy.add(String(s.leader));
    (s.support || []).forEach((u) => busy.add(String(u)));
  });
  return busy;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateWeek(orgId, weekKey) {
  let week = await ScheduleWeek.findOne({ organizationId: orgId, weekKey });
  if (!week) {
    week = await ScheduleWeek.create({ organizationId: orgId, weekKey, slots: [], blocks: [], auditLog: [] });
  }
  return week;
}

// Computes the tri-state / boolean readiness object for every non-Removed slot and attaches
// it as `slot.readiness`. Mirrors StageProcurement's Product.isRawMaterial + ingredients[].
// rawMaterialId stock join (production.routes.js / StageSteps.jsx), done server-side here so
// the schedule grid can show a readiness dot without re-fetching each order individually.
async function attachReadiness(slots, blocks, orgId) {
  const rawMaterialIds = new Set();
  slots.forEach((s) => {
    if (s.status === 'Removed') return;
    (s.productionOrderId?.ingredients || []).forEach((ing) => {
      if (ing.rawMaterialId && mongoose.Types.ObjectId.isValid(ing.rawMaterialId)) rawMaterialIds.add(String(ing.rawMaterialId));
    });
  });

  const stockMap = new Map();
  if (rawMaterialIds.size) {
    const products = await Product.find({
      _id: { $in: [...rawMaterialIds] }, organizationId: orgId, isRawMaterial: true,
    }).select('currentStock');
    products.forEach((p) => stockMap.set(String(p._id), p.currentStock));
  }

  return slots.map((s) => {
    if (s.status === 'Removed') return s;
    const order = s.productionOrderId;

    const formula = !!(order?.catalogProduct?.formulation?.rows?.length);
    const pkg = !!order?.container;

    // rm: true = all ingredients with a linked raw material have enough stock,
    // false = at least one is short, null = nothing to check yet (no formula/ingredients).
    let rm = null;
    const ingredients = (order?.ingredients || []).filter(
      (ing) => ing.rawMaterialId && mongoose.Types.ObjectId.isValid(ing.rawMaterialId)
    );
    if (ingredients.length) {
      rm = ingredients.every((ing) => (stockMap.get(String(ing.rawMaterialId)) ?? 0) >= (ing.targetQty || 0));
    }

    const blockedUserIds = new Set(
      blocks.filter((b) => b.date === s.date).map((b) => String(b.userId?._id || b.userId))
    );
    const leaderId = s.leader ? String(s.leader._id || s.leader) : null;
    const supportIds = (s.support || []).map((u) => String(u?._id || u));
    const people = !!leaderId && !blockedUserIds.has(leaderId) && supportIds.every((id) => !blockedUserIds.has(id));

    const ready = formula && pkg && rm === true && people;
    s.readiness = { formula, pkg, rm, people, ready };
    return s;
  });
}

async function populateWeekResponse(week, orgId) {
  await week.populate([
    { path: 'slots.leader', select: 'firstName lastName' },
    { path: 'slots.support', select: 'firstName lastName' },
    {
      path: 'slots.productionOrderId',
      select: 'orderNumber customer catalogProduct batchSizeKg deliveryDate stage container ingredients leadId',
      populate: { path: 'catalogProduct', select: 'name code formulation' },
    },
    { path: 'blocks.userId', select: 'firstName lastName' },
  ]);
  const obj = week.toObject();
  obj.slots = await attachReadiness(obj.slots, obj.blocks, orgId);
  return obj;
}

// Support-credit fairness ledger: count of a user's id appearing in `support` arrays across
// ALL of this org's ScheduleWeek docs whose slots fall in the current calendar month, excluding
// Removed slots. Same fairness rule as the mockup's monthCredits().
async function computeSupportCredits(orgId) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const weeks = await ScheduleWeek.find({ organizationId: orgId }).select('slots.date slots.status slots.support');
  const credits = new Map();
  weeks.forEach((w) => {
    w.slots.forEach((s) => {
      if (s.status === 'Removed') return;
      const d = new Date(s.date);
      if (Number.isNaN(d.getTime()) || d < monthStart || d >= monthEnd) return;
      (s.support || []).forEach((uid) => {
        const key = String(uid);
        credits.set(key, (credits.get(key) || 0) + 1);
      });
    });
  });
  return credits;
}

function requireReasonIfFrozen(week, reason, res) {
  if (week.frozen && !String(reason || '').trim()) {
    sendError(res, 'This week is frozen — a reason is required to make changes.', 400);
    return false;
  }
  return true;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET fetch-or-create the week doc with populated slots/blocks + computed readiness
router.get('/:weekKey', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const week = await getOrCreateWeek(orgId, req.params.weekKey);
  const populated = await populateWeekResponse(week, orgId);
  sendSuccess(res, { week: populated });
}));

// GET the tray — stage-1 orders not yet placed in a non-Removed slot in any week this org
router.get('/:weekKey/tray', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;

  const weeks = await ScheduleWeek.find({ organizationId: orgId }).select('slots.productionOrderId slots.status');
  const scheduled = new Set();
  weeks.forEach((w) => w.slots.forEach((s) => {
    if (s.status !== 'Removed' && s.productionOrderId) scheduled.add(String(s.productionOrderId));
  }));

  const orders = await ProductionOrder.find({
    organizationId: orgId, stage: 1, _id: { $nin: [...scheduled] },
  })
    .populate('catalogProduct', 'name code formulation')
    .sort({ deliveryDate: 1 });

  sendSuccess(res, { orders });
}));

// POST place a tray batch into a date+slot, auto-assigning leader/support
router.post('/:weekKey/slots', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { productionOrderId, date, slot } = req.body;
  if (!productionOrderId || !date || !slot) {
    return sendError(res, 'productionOrderId, date and slot are required.', 400);
  }
  if (!['AM', 'PM'].includes(slot)) return sendError(res, 'slot must be AM or PM.', 400);

  const order = await ProductionOrder.findOne({ _id: productionOrderId, organizationId: orgId })
    .populate({ path: 'leadId', select: 'assignedTo' });
  if (!order) return sendError(res, 'Production order not found.', 404);

  const week = await getOrCreateWeek(orgId, req.params.weekKey);

  const clash = week.slots.some((s) => s.date === date && s.slot === slot && s.status !== 'Removed');
  if (clash) return sendError(res, 'That date/slot already has a batch scheduled.', 409);

  // Auto-assign leader: the order's own assignedTo (already resolved from the lead's production
  // in-charge, falling back to the narrower intake-rep field, at order-creation time — see
  // linkProduction/linkSampleProduction) takes priority over the raw lead field, which is stale
  // once in-charge exists.
  const leader = order.assignedTo || order.leadId?.assignedTo || null;

  // Auto-assign support: one active Production-dept user, excluding the leader, anyone
  // blocked on this date, and anyone already leader/support on another batch that day
  // (double-booking guard) — by lowest support-credit count this calendar month.
  const blockedUserIds = new Set(week.blocks.filter((b) => b.date === date).map((b) => String(b.userId)));
  const busyUserIds = getBusyUserIds(week, date, null);
  const prodUsers = await User.find({ organizationId: orgId, department: 'Production', isActive: true }).select('_id');
  const credits = await computeSupportCredits(orgId);

  const candidates = prodUsers
    .map((u) => String(u._id))
    .filter((id) => id !== String(leader) && !blockedUserIds.has(id) && !busyUserIds.has(id))
    .sort((a, b) => (credits.get(a) || 0) - (credits.get(b) || 0));
  const support = candidates.length ? [candidates[0]] : [];

  week.slots.push({
    date, slot, productionOrderId,
    leader: leader || undefined,
    support,
    status: 'Planned',
    createdAt: new Date(),
    createdBy: req.user._id,
  });
  week.auditLog.push({
    at: new Date(), byUserId: req.user._id,
    change: `Placed ${order.orderNumber} into ${date} ${slot}`,
  });
  await week.save();

  const populated = await populateWeekResponse(week, orgId);
  sendSuccess(res, { week: populated }, 'Slot created', 201);
}));

// PATCH edit a slot (leader/support/status). Confirming syncs to the linked ProductionOrder's
// Work Assignment and advances stage 1 -> 2 the same way /production/:id/work-assignment does.
router.patch('/:weekKey/slots/:slotId', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { leader, support, status, reason } = req.body;

  const week = await getOrCreateWeek(orgId, req.params.weekKey);
  const slotDoc = week.slots.id(req.params.slotId);
  if (!slotDoc) return sendError(res, 'Slot not found.', 404);

  if (!requireReasonIfFrozen(week, reason, res)) return;

  // Double-booking guard: reject a leader/support pick already on another batch in this
  // exact date+slot. Also cap support at 1 person — only the batch leader plus one support
  // actually works a batch, per team's real staffing.
  const nextSupport = support !== undefined ? (Array.isArray(support) ? support.slice(0, 1) : []) : slotDoc.support;
  const nextLeader = leader !== undefined ? (leader || null) : slotDoc.leader;
  const busyUserIds = getBusyUserIds(week, slotDoc.date, slotDoc._id);
  const picked = [nextLeader, ...(nextSupport || [])].filter(Boolean).map(String);
  const doubleBooked = picked.find((id) => busyUserIds.has(id));
  if (doubleBooked) {
    return sendError(res, 'That person is already assigned to another batch that day.', 409);
  }

  const changes = [];
  if (leader !== undefined) { slotDoc.leader = leader || null; changes.push('leader'); }
  if (support !== undefined) { slotDoc.support = nextSupport; changes.push('support'); }
  if (status !== undefined && status !== slotDoc.status) { slotDoc.status = status; changes.push(`status → ${status}`); }

  if (status === 'Confirmed') {
    const [leaderUser, supportUsers, order] = await Promise.all([
      slotDoc.leader ? User.findById(slotDoc.leader).select('firstName lastName') : null,
      slotDoc.support?.length ? User.find({ _id: { $in: slotDoc.support } }).select('firstName lastName') : [],
      ProductionOrder.findOne({ _id: slotDoc.productionOrderId, organizationId: orgId }),
    ]);

    if (order) {
      const leaderName = leaderUser ? `${leaderUser.firstName} ${leaderUser.lastName}` : undefined;
      const supportNames = supportUsers.length ? supportUsers.map((u) => `${u.firstName} ${u.lastName}`).join(', ') : undefined;
      const existing = order.workAssignment?.toObject?.() || order.workAssignment || {};
      const patch = {
        weighDate: slotDoc.date,
        prodDate: slotDoc.date,
        weighPerson: leaderName ?? existing.weighPerson,
        prodPerson: leaderName ?? existing.prodPerson,
        packPerson: supportNames ?? existing.packPerson,
        supervisor: `${req.user.firstName} ${req.user.lastName}`,
      };
      const advanced = applyWorkAssignment(order, patch, req.user._id);
      await order.save();
      notifyStageChange(req, order);
      if (advanced) notifyClientMilestone(order, 'Your order has been scheduled with our production team — raw materials are now being procured 🧾');
    }
  }

  week.auditLog.push({
    at: new Date(), byUserId: req.user._id,
    change: `Slot ${req.params.slotId} updated (${changes.join(', ') || 'no field changes'})${reason ? ` — reason: ${reason}` : ''}`,
  });
  await week.save();

  const populated = await populateWeekResponse(week, orgId);
  sendSuccess(res, { week: populated }, 'Slot updated');
}));

// DELETE soft-delete a slot (status = Removed)
router.delete('/:weekKey/slots/:slotId', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { reason } = req.body || {};

  const week = await getOrCreateWeek(orgId, req.params.weekKey);
  const slotDoc = week.slots.id(req.params.slotId);
  if (!slotDoc) return sendError(res, 'Slot not found.', 404);

  if (!requireReasonIfFrozen(week, reason, res)) return;

  slotDoc.status = 'Removed';
  week.auditLog.push({
    at: new Date(), byUserId: req.user._id,
    change: `Removed slot ${req.params.slotId}${reason ? ` — reason: ${reason}` : ''}`,
  });
  await week.save();

  const populated = await populateWeekResponse(week, orgId);
  sendSuccess(res, { week: populated }, 'Slot removed');
}));

// POST cycle/create an availability block for a user on a date
router.post('/:weekKey/blocks', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { date, userId, type, reason } = req.body;
  if (!date || !userId) return sendError(res, 'date and userId are required.', 400);

  const week = await getOrCreateWeek(orgId, req.params.weekKey);
  if (!requireReasonIfFrozen(week, reason, res)) return;

  const existing = week.blocks.find((b) => b.date === date && String(b.userId) === String(userId));
  if (existing) {
    const idx = BLOCK_CYCLE.indexOf(existing.type);
    const nextType = idx === -1 || idx === BLOCK_CYCLE.length - 1 ? null : BLOCK_CYCLE[idx + 1];
    if (nextType) {
      existing.type = nextType;
      week.auditLog.push({ at: new Date(), byUserId: req.user._id, change: `Block for ${userId} on ${date} cycled to ${nextType}` });
    } else {
      week.blocks.pull(existing._id);
      week.auditLog.push({ at: new Date(), byUserId: req.user._id, change: `Block for ${userId} on ${date} cleared` });
    }
  } else {
    const initialType = BLOCK_CYCLE.includes(type) ? type : BLOCK_CYCLE[0];
    week.blocks.push({ date, userId, type: initialType, source: 'manual' });
    week.auditLog.push({ at: new Date(), byUserId: req.user._id, change: `Block ${initialType} added for ${userId} on ${date}` });
  }

  await week.save();
  const populated = await populateWeekResponse(week, orgId);
  sendSuccess(res, { week: populated }, 'Block updated');
}));

// DELETE remove a block outright
router.delete('/:weekKey/blocks', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { date, userId, reason } = req.body || {};
  if (!date || !userId) return sendError(res, 'date and userId are required.', 400);

  const week = await getOrCreateWeek(orgId, req.params.weekKey);
  if (!requireReasonIfFrozen(week, reason, res)) return;

  const existing = week.blocks.find((b) => b.date === date && String(b.userId) === String(userId));
  if (existing) {
    week.blocks.pull(existing._id);
    week.auditLog.push({ at: new Date(), byUserId: req.user._id, change: `Block removed for ${userId} on ${date}` });
    await week.save();
  }

  const populated = await populateWeekResponse(week, orgId);
  sendSuccess(res, { week: populated }, 'Block removed');
}));

// POST freeze the week — rejected if any non-Removed slot isn't fully ready
router.post('/:weekKey/freeze', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const week = await getOrCreateWeek(orgId, req.params.weekKey);
  const populated = await populateWeekResponse(week, orgId);

  const notReady = populated.slots.filter((s) => s.status !== 'Removed' && !s.readiness?.ready);
  if (notReady.length) {
    return sendError(res, `Cannot freeze — ${notReady.length} slot(s) are not fully ready.`, 400);
  }

  week.frozen = true;
  week.auditLog.push({ at: new Date(), byUserId: req.user._id, change: 'Week frozen' });
  await week.save();

  const refreshed = await populateWeekResponse(week, orgId);
  sendSuccess(res, { week: refreshed }, 'Week frozen');
}));

// POST unfreeze the week — unconditional
router.post('/:weekKey/unfreeze', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const week = await getOrCreateWeek(orgId, req.params.weekKey);

  week.frozen = false;
  week.auditLog.push({ at: new Date(), byUserId: req.user._id, change: 'Week unfrozen' });
  await week.save();

  const populated = await populateWeekResponse(week, orgId);
  sendSuccess(res, { week: populated }, 'Week unfrozen');
}));

module.exports = router;
