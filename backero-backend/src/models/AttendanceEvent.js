// AttendanceEvent — raw check-in/out ingestion, immutable/append-only.
// Ported from the Attendance Tracker's AttendanceEvent model. Never
// updated or deleted after insert — every "correction" is a NEW event
// document (source=MANUAL_CORRECTION), never an edit of an old one.
const mongoose = require('mongoose');
const { ATTENDANCE_EVENT_TYPES, ATTENDANCE_EVENT_SOURCES } = require('../utils/attendanceConstants');

const attendanceEventSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricDevice', default: null },
  // The employee identifier as known to the device/source (raw/unresolved) —
  // for manual corrections this is the employee's employeeCode.
  deviceEmployeeRef: { type: String, required: true, trim: true },
  // Resolved internal employee id; null means "could not be matched to a
  // known employee" — this is what makes the row an "exception".
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
  eventType: { type: String, enum: ATTENDANCE_EVENT_TYPES, required: true },
  // The original raw payload from the device/import, stored verbatim.
  rawEvent: { type: mongoose.Schema.Types.Mixed, required: true },
  source: { type: String, enum: ATTENDANCE_EVENT_SOURCES, required: true },
  // Idempotency key — unique constraint is the enforcement mechanism.
  dedupeKey: { type: String, required: true },
  eventTimestamp: { type: Date, required: true, index: true },
  receivedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: true, updatedAt: false } });

attendanceEventSchema.index({ organizationId: 1, dedupeKey: 1 }, { unique: true });
attendanceEventSchema.index({ organizationId: 1, employeeId: 1, eventTimestamp: 1 });

module.exports = mongoose.model('AttendanceEvent', attendanceEventSchema);
