const mongoose = require('mongoose');

const punchRecordSchema = new mongoose.Schema({
  punchType: {
    type: String,
    enum: ['punch-in', 'break-start', 'break-end', 'punch-out'],
    required: true
  },
  timestamp: { type: Date, default: Date.now },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number]
  },
  address: String
}, { _id: false });

const attendanceLogSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Multiple punches in one day
  punches: [punchRecordSchema],

  // Summary data
  officeCheckInTime: Date,
  officeCheckOutTime: Date,
  breakStartTime: Date,
  breakEndTime: Date,
  breakDuration: Number, // minutes
  totalWorkHours: Number,
  totalBreakHours: Number,

  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'early-leave', 'half-day'],
    default: 'present',
    index: true
  },
  currentPunchStatus: {
    type: String,
    enum: ['not-punched', 'office-in', 'on-break', 'office-out'],
    default: 'not-punched'
  },

  notes: String,
  deviceId: String,

  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
attendanceLogSchema.index({ 'punches.location': '2dsphere' });
attendanceLogSchema.index({ organizationId: 1, employeeId: 1, createdAt: -1 });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);
