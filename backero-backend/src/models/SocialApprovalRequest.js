const mongoose = require('mongoose');
const { SOCIAL_APPROVAL_STATUS } = require('../utils/constants');

const socialApprovalRequestSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  externalId: { type: String, required: true },
  platform: { type: String, default: 'other' },
  campaignName: { type: String },
  caption: { type: String },
  mediaUrls: [{ url: String, type: { type: String, enum: ['image', 'video'] } }],
  scheduledFor: { type: Date },
  status: {
    type: String,
    enum: Object.values(SOCIAL_APPROVAL_STATUS),
    default: SOCIAL_APPROVAL_STATUS.PENDING,
    index: true,
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewNotes: { type: String },
  reviewedAt: { type: Date },
  // Set once the automation system reports back what actually happened on
  // the platform (separate from the approve/reject decision above).
  publishedUrls: [{ platform: String, url: String }],
  publishError: { type: String },
  publishedAt: { type: Date },
  callbackUrl: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed },
  callbackStatus: { type: String, enum: ['pending', 'delivered', 'failed'], default: 'pending' },
  callbackAttempts: { type: Number, default: 0 },
  requestedAt: { type: Date, default: Date.now },
}, { timestamps: true });

socialApprovalRequestSchema.index({ organizationId: 1, externalId: 1 }, { unique: true });
socialApprovalRequestSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('SocialApprovalRequest', socialApprovalRequestSchema);
