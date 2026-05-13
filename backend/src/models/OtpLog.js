const mongoose = require('mongoose');

const otpLogSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isUsed: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

// MongoDB TTL index – auto-deletes documents after expiry
otpLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpLogSchema.index({ phone: 1, isUsed: 1 });

module.exports = mongoose.model('OtpLog', otpLogSchema);
