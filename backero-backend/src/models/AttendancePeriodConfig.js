// AttendancePeriodConfig — versioned period-shape config (e.g. "21st to
// 20th" payroll cycles). Additive/versioned: a new row with a later
// effectiveFrom only affects periods generated on/after that date; existing
// AttendancePeriod rows keep their boundaries forever.
const mongoose = require('mongoose');

const attendancePeriodConfigSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  periodStartDay: { type: Number, required: true, min: 1, max: 28 },
  periodEndDay: { type: Number, required: true, min: 1, max: 28 },
  effectiveFrom: { type: Date, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

attendancePeriodConfigSchema.index({ organizationId: 1, effectiveFrom: 1 });

module.exports = mongoose.model('AttendancePeriodConfig', attendancePeriodConfigSchema);
