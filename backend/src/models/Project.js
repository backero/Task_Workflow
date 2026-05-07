const mongoose = require('mongoose');

const PROJECT_STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'];
const PROJECT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: '', maxlength: 1000 },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: PROJECT_STATUSES, default: 'ACTIVE' },
    color: { type: String, default: '#6366f1' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    dueDate: { type: Date, default: null },
    taskCount: { type: Number, default: 0 },
    completedTaskCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

projectSchema.index({ organizationId: 1, status: 1 });
projectSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('Project', projectSchema);
module.exports.PROJECT_STATUSES = PROJECT_STATUSES;
module.exports.PROJECT_COLORS = PROJECT_COLORS;
