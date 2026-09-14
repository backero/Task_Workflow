// AttendanceCorrection — the correction/approval-workflow record. ONLY
// created when the covering AttendancePeriod is FINALIZED (corrections
// against an OPEN period apply immediately, straight to Attendance +
// AttendanceEvent, and never create a row here — see
// attendance.controller.js#requestCorrection).
const mongoose = require('mongoose');
const { CORRECTION_STATUSES } = require('../utils/attendanceConstants');

const attendanceCorrectionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  proposedCheckIn: { type: Date, default: null },
  proposedCheckOut: { type: Date, default: null },
  status: { type: String, enum: CORRECTION_STATUSES, default: 'PENDING_APPROVAL' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('AttendanceCorrection', attendanceCorrectionSchema);
