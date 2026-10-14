// PayrollRecordCorrection — a staged correction pending dual-approval,
// mirroring AttendanceCorrection's shape. Only created against a finalized
// PayrollRecord — an OPEN period's records are corrected by simply
// re-running generate(), not through this table.
const mongoose = require('mongoose');

const payrollRecordCorrectionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  payrollRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRecord', required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  proposedBasicEarnings: { type: Number, required: true },
  proposedDeductions: { type: Number, required: true },
  status: { type: String, enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'], default: 'PENDING_APPROVAL' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('PayrollRecordCorrection', payrollRecordCorrectionSchema);
