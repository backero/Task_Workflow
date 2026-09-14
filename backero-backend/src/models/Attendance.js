// Attendance — derived daily record, one per (employee, date). Ported from
// the Attendance Tracker's Attendance model. Upserted by the processor
// (see services/attendanceProcessor.service.js) — is_corrected/
// correction_history are deliberately NOT touched by the processor's
// upsert, only by the correction endpoints, so a later plain re-derivation
// never wipes correction history (see processor's process() comment).
const mongoose = require('mongoose');
const { ATTENDANCE_STATUSES } = require('../utils/attendanceConstants');

const correctionHistoryEntrySchema = new mongoose.Schema({
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason: { type: String },
  previousValue: {
    checkIn: { type: Date, default: null },
    checkOut: { type: Date, default: null },
    status: { type: String },
  },
  newValue: {
    checkIn: { type: Date, default: null },
    checkOut: { type: Date, default: null },
    status: { type: String },
  },
  appliedAt: { type: Date, default: Date.now },
}, { _id: false });

const attendanceSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  attendancePeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendancePeriod', required: true },
  attendanceDate: { type: Date, required: true },
  checkIn: { type: Date, default: null },
  checkOut: { type: Date, default: null },
  status: { type: String, enum: ATTENDANCE_STATUSES, required: true },
  isCorrected: { type: Boolean, default: false },
  correctionHistory: { type: [correctionHistoryEntrySchema], default: [] },
}, { timestamps: true });

attendanceSchema.index({ organizationId: 1, employeeId: 1, attendanceDate: 1 }, { unique: true });
attendanceSchema.index({ organizationId: 1, attendanceDate: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
