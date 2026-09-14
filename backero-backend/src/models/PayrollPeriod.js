// PayrollPeriod — ported from the Attendance Tracker's PayrollPeriod
// model. Independent of AttendancePeriod (a different lifecycle, different
// table) — a payroll period just has a date range checked for overlap
// against other payroll periods at creation time.
const mongoose = require('mongoose');

const payrollPeriodSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  status: { type: String, enum: ['OPEN', 'FINALIZED'], default: 'OPEN' },
  finalizedAt: { type: Date, default: null },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('PayrollPeriod', payrollPeriodSchema);
