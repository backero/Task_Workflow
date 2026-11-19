const mongoose = require('mongoose');

// One editable policy per organization. Changes govern future requests and
// generated payroll only; finalized attendance/payroll remains immutable.
const attendancePolicySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true, index: true },
  payrollStartDay: { type: Number, min: 1, max: 28, default: 21 },
  payrollEndDay: { type: Number, min: 1, max: 31, default: 20 },
  casualLeavePerCycle: { type: Number, min: 0, default: 1 },
  sickLeavePerCycle: { type: Number, min: 0, default: 1 },
  sandwichLeaveEnabled: { type: Boolean, default: true },
  correctionRequestsPerCycle: { type: Number, min: 0, max: 12, default: 3 },
  lateGraceMinutes: { type: Number, min: 0, default: 10 },
  halfDayAfterLateMinutes: { type: Number, min: 0, default: 240 },
  defaultAdvanceInstallment: { type: Number, min: 0, default: 0 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('AttendancePolicy', attendancePolicySchema);
