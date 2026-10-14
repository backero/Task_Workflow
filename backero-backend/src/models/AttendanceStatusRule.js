// AttendanceStatusRule — versioned key-value config for the status-
// derivation algorithm. Rows are never mutated/deleted; a new row with a
// later effectiveFrom supersedes older ones for that ruleKey going forward
// only (never retroactive). See attendanceProcessor.service.js#getEffectiveRules.
const mongoose = require('mongoose');

const attendanceStatusRuleSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  ruleKey: { type: String, required: true, trim: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  effectiveFrom: { type: Date, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

attendanceStatusRuleSchema.index({ organizationId: 1, ruleKey: 1, effectiveFrom: 1 });

module.exports = mongoose.model('AttendanceStatusRule', attendanceStatusRuleSchema);
