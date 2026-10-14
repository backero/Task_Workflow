// LeaveType — org-scoped leave categories (e.g. Casual, Sick, Earned).
// Balances are manually set by HR per employee per type (see LeaveBalance),
// not automatically accrued — matches how Employee.basicMonthlySalary is
// handled today.
const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  isPaid: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

leaveTypeSchema.index({ organizationId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
