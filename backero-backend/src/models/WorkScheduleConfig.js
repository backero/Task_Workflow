// WorkScheduleConfig — org-wide weekly-off configuration. Versioned by
// effectiveFrom, same append-only pattern as AttendanceStatusRule/
// AttendancePeriodConfig: rows are never mutated, a new row with a later
// effectiveFrom supersedes older ones for dates on/after it.
const mongoose = require('mongoose');

const workScheduleConfigSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  // 0=Sunday .. 6=Saturday (matches JS Date#getUTCDay()).
  weekOffDays: { type: [Number], default: [0], validate: (v) => v.every((d) => d >= 0 && d <= 6) },
  effectiveFrom: { type: Date, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

workScheduleConfigSchema.index({ organizationId: 1, effectiveFrom: 1 });

module.exports = mongoose.model('WorkScheduleConfig', workScheduleConfigSchema);
