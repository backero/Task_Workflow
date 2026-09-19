const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, DEPARTMENTS } = require('../utils/constants');
const { HR_AUTO_GRANT_PERMISSIONS } = require('../utils/attendanceConstants');

const userSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String },
  whatsapp: { type: String },
  password: { type: String, required: false, select: false, minlength: 8 },
  googleId: { type: String, select: false },
  googleEmail: { type: String, lowercase: true, trim: true },
  role: {
    type: String,
    enum: Object.values(ROLES),
    default: ROLES.MEMBER,
  },
  department: { type: String },
  designation: { type: String },
  // Production Kitchen scheduling — not used for filtering in v1 (support-picking is by
  // availability + fairness only), stored now so v2's skills-aware auto-assign doesn't
  // need a migration later.
  skills: { type: [String], enum: ['weighing', 'vessel', 'filling', 'packing'], default: [] },
  employeeId: { type: String },
  avatar: { type: String },
  avatarPublicId: { type: String, select: false },
  reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  whatsappVerified: { type: Boolean, default: false },
  lastLogin: { type: Date },
  lastActive: { type: Date },
  refreshToken: { type: String, select: false },
  otp: { type: String, select: false },
  otpExpiry: { type: Date, select: false },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
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
userSchema.index({ phone: 1 });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Keep attendance/payroll/employee module permissions in sync with
// department: HR-department users automatically get the read+onboarding
// permission set (see HR_AUTO_GRANT_PERMISSIONS); moving out of HR removes
// exactly that auto-granted set while preserving any other permission an
// admin added manually. Covers direct .save()/.create() (this hook) — see
// the findOneAndUpdate hook below for the PUT/PATCH /api/users routes,
// which all persist via Model.findOneAndUpdate/findByIdAndUpdate and never
// trigger 'save' middleware.
userSchema.pre('save', function (next) {
  if (!this.isModified('department') && !this.isNew) return next();
  const isHR = (this.department || '').trim().toUpperCase() === DEPARTMENTS.HR;
  const current = this.permissions || [];
  this.permissions = isHR
    ? Array.from(new Set([...current, ...HR_AUTO_GRANT_PERMISSIONS]))
    : current.filter((p) => !HR_AUTO_GRANT_PERMISSIONS.includes(p));
  next();
});

userSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() || {};
  // Mongoose's timestamps plugin injects its own partial `$set`/
  // `$setOnInsert` alongside whatever flat top-level fields the route
  // handler passed — department/permissions can be in either place, so
  // both must be checked, and the result is always normalized back into
  // `$set` (safe regardless of which form the caller used).
  const department = update.department !== undefined ? update.department : update.$set?.department;
  if (department === undefined) return next();

  const explicitPermissions = update.permissions !== undefined
    ? update.permissions
    : update.$set?.permissions;
  const existing = explicitPermissions === undefined
    ? await this.model.findOne(this.getQuery()).select('permissions').lean()
    : null;
  const basePermissions = explicitPermissions !== undefined ? explicitPermissions : (existing?.permissions || []);
  const isHR = (department || '').trim().toUpperCase() === DEPARTMENTS.HR;
  const nextPermissions = isHR
    ? Array.from(new Set([...basePermissions, ...HR_AUTO_GRANT_PERMISSIONS]))
    : basePermissions.filter((p) => !HR_AUTO_GRANT_PERMISSIONS.includes(p));

  delete update.permissions;
  update.$set = { ...(update.$set || {}), permissions: nextPermissions };
  this.setUpdate(update);
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
