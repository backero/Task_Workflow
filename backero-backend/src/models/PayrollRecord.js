// PayrollRecord — one employee's earnings/deductions for one PayrollPeriod.
// Ported from the Attendance Tracker's PayrollRecord model.
// `attendanceSummarySnapshot` is frozen at generation time (re-generating
// an OPEN period's records overwrites it; finalize() freezes it for good).
const mongoose = require('mongoose');

const payrollRecordSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  payrollPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollPeriod', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  basicEarnings: { type: Number, required: true },
  deductions: { type: Number, required: true },
  netSalary: { type: Number, required: true },
  attendanceSummarySnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  isFinalized: { type: Boolean, default: false },
  finalizedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },

  // Itemized breakdown for the payslip PDF — default 0 so a plain
  // computeEarnings()-generated record (no DA/HRA/PF/ESIC concept) still
  // renders a sensible slip. Populated with real amounts when this record
  // comes from payrollImport.service.js (already-paid salary Excel).
  dearnessAllowance: { type: Number, default: 0 },
  houseRentAllowance: { type: Number, default: 0 },
  grossEarnings: { type: Number, default: null },
  pf: { type: Number, default: 0 },
  esic: { type: Number, default: 0 },
  loanAdvance: { type: Number, default: 0 },
  // GENERATED = computed here from attendance (computeEarnings); IMPORTED =
  // came verbatim from an already-paid salary Excel upload.
  source: { type: String, enum: ['GENERATED', 'IMPORTED'], default: 'GENERATED' },
});

payrollRecordSchema.index({ organizationId: 1, payrollPeriodId: 1, employeeId: 1 }, { unique: true });

module.exports = mongoose.model('PayrollRecord', payrollRecordSchema);
