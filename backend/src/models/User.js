const mongoose = require('mongoose');
const { ROLES } = require('../utils/constants');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      match: [/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +919876543210)'],
    },
    email: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
      sparse: true,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.EMPLOYEE,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null, // null for SUPER_ADMIN
    },
    designation: { type: String, default: null },
    department: { type: String, default: null },
    avatar: { type: String, default: null },
    joiningDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.index({ organizationId: 1, role: 1 });
userSchema.index({ organizationId: 1, isActive: 1 });

// Strip sensitive fields from JSON output
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  return obj;
};

module.exports = mongoose.model('User', userSchema);
