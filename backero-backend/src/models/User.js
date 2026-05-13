const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../utils/constants');

const userSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  whatsapp: { type: String },
  password: { type: String, required: true, select: false, minlength: 8 },
  role: {
    type: String,
    enum: Object.values(ROLES),
    default: ROLES.MEMBER,
  },
  department: { type: String },
  designation: { type: String },
  employeeId: { type: String },
  avatar: { type: String },
  reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  whatsappVerified: { type: Boolean, default: false },
  lastLogin: { type: Date },
  lastActive: { type: Date },
  refreshToken: { type: String, select: false },
  otp: { type: String, select: false },
  otpExpiry: { type: Date, select: false },
  permissions: [{ type: String }],
  settings: {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    notifications: {
      inApp: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
    },
    defaultDepartment: { type: String },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Compound indexes
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
userSchema.index({ organizationId: 1, department: 1 });
userSchema.index({ organizationId: 1, role: 1 });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.refreshToken;
    delete ret.otp;
    delete ret.otpExpiry;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
