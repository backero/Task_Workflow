const mongoose = require('mongoose');
const { APPROVAL_STATUS } = require('../utils/constants');

const taskApprovalSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: {
    type: String,
    enum: Object.values(APPROVAL_STATUS),
    default: APPROVAL_STATUS.PENDING,
    index: true,
  },
  requestNotes: { type: String },
  reviewNotes: { type: String },
  attachments: [{ url: String, name: String, type: String }],
  requestedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
  round: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

taskApprovalSchema.index({ organizationId: 1, status: 1 });
taskApprovalSchema.index({ organizationId: 1, requestedBy: 1 });
taskApprovalSchema.index({ organizationId: 1, reviewedBy: 1 });

module.exports = mongoose.model('TaskApproval', taskApprovalSchema);
