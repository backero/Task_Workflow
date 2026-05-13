const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      // e.g. 'user.login', 'task.created', 'org.created'
    },
    entity: {
      type: String,
      default: null, // e.g. 'Task', 'User', 'Organization'
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: { type: String, default: null },
  },
  { timestamps: true }
);

activityLogSchema.index({ organizationId: 1, createdAt: -1 });
activityLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
