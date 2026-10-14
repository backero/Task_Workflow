// BiometricDevice registry — ported from the Attendance Tracker's
// BiometricDevice model. `connectionSecretRef` is a reference into a
// secrets manager, never a plaintext credential — resolved to an actual
// secret only at connect-time by a real vendor adapter (not built yet, see
// services/biometricAdapters.service.js). `importConfig` is only used for
// vendor='CSV_IMPORT' devices (no live push/pull protocol — attendance
// arrives as a periodic file export instead).
const mongoose = require('mongoose');

const biometricDeviceSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  vendor: { type: String, required: true, default: 'MOCK' },
  locationLabel: { type: String, default: null },
  connectionSecretRef: { type: String, default: null },
  lastSeenAt: { type: Date, default: null },
  status: { type: String, enum: ['ONLINE', 'OFFLINE', 'UNKNOWN'], default: 'UNKNOWN' },
  // Device clock minus server clock, from a future adapter's
  // getClockDrift(). Null until the first scheduled health check runs.
  clockDriftSeconds: { type: Number, default: null },
  lastHealthCheckAt: { type: Date, default: null },
  // Shape: {employeeRefColumn, dateColumn, checkInColumn, checkOutColumn,
  // dateFormat, timeFormat, utcOffsetMinutes}. Null for every other vendor.
  importConfig: { type: mongoose.Schema.Types.Mixed, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('BiometricDevice', biometricDeviceSchema);
