// LocationTrackingSession — ported from the Attendance Tracker's
// LocationTrackingSession model. OFFICE employees never get a session;
// FIELD employees only while one is open — enforced in the service layer.
// The partial-unique-index equivalent ("only one open session per
// employee") is enforced in the service via a race-safe check, not a
// Mongo partial unique index (Mongoose doesn't model "WHERE endedAt IS
// NULL" uniqueness cleanly) — see services/location.service.js#startSession.
const mongoose = require('mongoose');

const locationTrackingSessionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  // No `default: null` here deliberately — Mongoose's enum validator
  // checks an explicitly-assigned `null` against the enum list (and fails,
  // since null isn't a listed value), even though it happily allows the
  // field to be simply absent/undefined. Leaving it unset until
  // endSession() assigns a real reason avoids that false validation error.
  endReason: { type: String, enum: ['MANUAL', 'TIMEOUT', 'APP_KILLED', 'ADMIN_STOPPED'] },
});

module.exports = mongoose.model('LocationTrackingSession', locationTrackingSessionSchema);
