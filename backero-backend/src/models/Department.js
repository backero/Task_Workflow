const mongoose = require('mongoose');

const kpiSchema = new mongoose.Schema({
  name: { type: String, required: true },
  target: { type: Number, required: true },
  current: { type: Number, default: 0 },
  unit: { type: String },
  period: { type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], default: 'monthly' },
  isActive: { type: Boolean, default: true },
});

const departmentSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, uppercase: true },
  description: { type: String },
  head: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  color: { type: String, default: '#3b82f6' },
  icon: { type: String },
  isActive: { type: Boolean, default: true },
  kpis: [kpiSchema],
  settings: {
    taskApprovalRequired: { type: Boolean, default: true },
    autoEscalate: { type: Boolean, default: true },
    escalationHours: { type: Number, default: 24 },
    reminderFrequency: { type: String, default: 'daily' },
    platforms: [{ type: String }],
  },
  automationRules: [{
    name: String,
    trigger: String,
    condition: mongoose.Schema.Types.Mixed,
    action: mongoose.Schema.Types.Mixed,
    isActive: { type: Boolean, default: true },
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

departmentSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);
