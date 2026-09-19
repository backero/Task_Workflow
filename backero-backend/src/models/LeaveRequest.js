// LeaveRequest — an employee's leave application. workingDays is computed
// at creation time (calendar days in range minus week-offs/holidays) — it's
// what actually gets deducted from LeaveBalance.usedDays on approval, and
// what attendanceProcessor.service.js#deriveDefaultStatus checks to mark
// ON_LEAVE, so a leave spanning a weekend doesn't over-deduct or mark
// already-non-working days.
const mongoose = require('mongoose');

const LEAVE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

const leaveRequestSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  workingDays: { type: Number, required: true },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: LEAVE_REQUEST_STATUSES, default: 'PENDING' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, default: null },
}, { timestamps: true });

leaveRequestSchema.index({ organizationId: 1, employeeId: 1, startDate: -1 });
leaveRequestSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
module.exports.LEAVE_REQUEST_STATUSES = LEAVE_REQUEST_STATUSES;
