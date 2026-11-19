const mongoose = require('mongoose');

const employeeAdvanceSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  requestedAmount: { type: Number, required: true, min: 1 },
  approvedAmount: { type: Number, default: null, min: 0 },
  monthlyInstallment: { type: Number, default: null, min: 0 },
  remainingBalance: { type: Number, default: 0, min: 0 },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CLOSED'], default: 'PENDING', index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, default: null },
}, { timestamps: true });

employeeAdvanceSchema.index({ organizationId: 1, employeeId: 1, status: 1 });
module.exports = mongoose.model('EmployeeAdvance', employeeAdvanceSchema);
