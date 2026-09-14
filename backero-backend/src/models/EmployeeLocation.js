// EmployeeLocation — a single GPS ping within an open tracking session.
// Ported from the Attendance Tracker's EmployeeLocation model.
// `clientPointId` is a client-generated idempotency key (unique per org) —
// resubmitting the same point (e.g. after a network retry) is a no-op, not
// a duplicate row.
const mongoose = require('mongoose');

const employeeLocationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  trackingSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LocationTrackingSession', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  accuracyMeters: { type: Number, default: null },
  deviceInfo: { type: String, default: null },
  clientPointId: { type: String, required: true },
  isLowAccuracy: { type: Boolean, default: false },
  isAnomalous: { type: Boolean, default: false },
  recordedAt: { type: Date, required: true },
  receivedAt: { type: Date, default: Date.now },
});

employeeLocationSchema.index({ organizationId: 1, clientPointId: 1 }, { unique: true });
employeeLocationSchema.index({ organizationId: 1, trackingSessionId: 1, recordedAt: 1 });

module.exports = mongoose.model('EmployeeLocation', employeeLocationSchema);
