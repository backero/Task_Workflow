// AttendancePeriod — a pay-cycle-like window (e.g. 21 Jan - 20 Feb) with
// finalize/lock semantics. periodStart is unique per org. Finalization is
// one-way — no reopen endpoint exists (matches the source).
const mongoose = require('mongoose');
const { ATTENDANCE_PERIOD_STATUSES } = require('../utils/attendanceConstants');

const attendancePeriodSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  status: { type: String, enum: ATTENDANCE_PERIOD_STATUSES, default: 'OPEN' },
  configId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendancePeriodConfig', required: true },
  finalizedAt: { type: Date, default: null },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

attendancePeriodSchema.index({ organizationId: 1, periodStart: 1 }, { unique: true });

module.exports = mongoose.model('AttendancePeriod', attendancePeriodSchema);
