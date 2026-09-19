// LeaveBalance — one row per (employee, leaveType, year). totalDays is set
// directly by HR (no accrual math); usedDays is incremented/decremented by
// leave.service.js as requests are approved/rejected/cancelled.
const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  year: { type: Number, required: true },
  totalDays: { type: Number, required: true, default: 0 },
  usedDays: { type: Number, required: true, default: 0 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

leaveBalanceSchema.index({ organizationId: 1, employeeId: 1, leaveTypeId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);
