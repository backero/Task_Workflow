const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  checkInTime: { type: Date, required: true },
  checkOutTime: { type: Date },

  checkInLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: [Number] // [longitude, latitude]
  },
  checkOutLocation: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: [Number]
  },

  checkInAddress: String,
  checkOutAddress: String,

  hoursWorked: Number, // in hours
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'early-leave', 'half-day'],
    default: 'present',
    index: true
  },

  notes: String,
  deviceId: String,

  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Index for geospatial queries
attendanceLogSchema.index({ 'checkInLocation': '2dsphere' });
attendanceLogSchema.index({ organizationId: 1, employeeId: 1, createdAt: -1 });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);
