const mongoose = require('mongoose');

// One slot = one AM/PM production placement on a given calendar day.
const slotSchema = new mongoose.Schema({
  date: { type: String, required: true },   // 'YYYY-MM-DD'
  slot: { type: String, enum: ['AM', 'PM'], required: true },
  productionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionOrder' },
  leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  support: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['Planned', 'Confirmed', 'In Progress', 'Done', 'Removed'], default: 'Planned' },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

// A user's unavailability on a given day (R&D pull, client meeting, paperwork, leave).
const blockSchema = new mongoose.Schema({
  date: { type: String, required: true },   // 'YYYY-MM-DD'
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['RD', 'Client', 'Docs', 'Leave'], required: true },
  note: { type: String },
  source: { type: String, enum: ['manual', 'auto'], default: 'manual' },
});

const auditLogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  change: { type: String },
}, { _id: false });

// One document per organizationId + weekKey (e.g. '2026-W07'), mirroring the mockup's
// K.weeks[wk] shape as a real Mongoose doc. Single embedded doc per week (not 3 normalized
// collections) — matches the mockup's structure closely and is plenty at this scale
// (a handful of orgs, ~12 slots/week).
const scheduleWeekSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  weekKey: { type: String, required: true },
  frozen: { type: Boolean, default: false },
  slots: [slotSchema],
  blocks: [blockSchema],
  auditLog: [auditLogSchema],
}, { timestamps: true });

scheduleWeekSchema.index({ organizationId: 1, weekKey: 1 }, { unique: true });

module.exports = mongoose.model('ScheduleWeek', scheduleWeekSchema);
