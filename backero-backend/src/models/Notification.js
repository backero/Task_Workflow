const mongoose = require('mongoose');
const { NOTIFICATION_PRIORITY } = require('../utils/constants');

const notificationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ['task', 'approval', 'crm', 'inventory', 'production', 'finance', 'system', 'escalation', 'reminder'],
    required: true,
  },
  priority: { type: String, enum: Object.values(NOTIFICATION_PRIORITY), default: NOTIFICATION_PRIORITY.MEDIUM },
  isRead: { type: Boolean, default: false, index: true },
  readAt: { type: Date },
  actionUrl: { type: String },
  reference: {
    model: { type: String },
    id: { type: mongoose.Schema.Types.ObjectId },
  },
  channels: {
    inApp: { type: Boolean, default: true, sent: { type: Boolean, default: false } },
    whatsapp: { type: Boolean, default: false, sent: { type: Boolean, default: false } },
    email: { type: Boolean, default: false, sent: { type: Boolean, default: false } },
  },
  whatsappStatus: { type: String, enum: ['pending', 'sent', 'delivered', 'read', 'failed'], default: 'pending' },
  metadata: { type: mongoose.Schema.Types.Mixed },
  expiresAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

notificationSchema.index({ organizationId: 1, recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
