const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  module: {
    type: String,
    enum: ['task', 'crm', 'inventory', 'production', 'finance', 'auth', 'user', 'organization', 'marketing', 'marketplace'],
    required: true,
  },
  reference: {
    model: { type: String },
    id: { type: mongoose.Schema.Types.ObjectId },
    title: { type: String },
  },
  description: { type: String },
  previousData: { type: mongoose.Schema.Types.Mixed },
  newData: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  userAgent: { type: String },
  department: { type: String },
}, { timestamps: true });

activityLogSchema.index({ organizationId: 1, module: 1, createdAt: -1 });
activityLogSchema.index({ organizationId: 1, performedBy: 1, createdAt: -1 });
activityLogSchema.index({ organizationId: 1, 'reference.id': 1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
