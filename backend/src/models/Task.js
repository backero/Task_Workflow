const mongoose = require('mongoose');

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const commentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: TASK_STATUSES, default: 'TODO' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'MEDIUM' },
    dueDate: { type: Date, default: null },
    tags: [{ type: String, maxlength: 30 }],
    labelIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Label' }],
    estimatedMinutes: { type: Number, default: null, min: 1 },
    comments: [commentSchema],
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ organizationId: 1, assigneeId: 1 });
taskSchema.index({ organizationId: 1, status: 1 });
taskSchema.index({ projectId: 1, order: 1 });

module.exports = mongoose.model('Task', taskSchema);
module.exports.TASK_STATUSES = TASK_STATUSES;
module.exports.TASK_PRIORITIES = TASK_PRIORITIES;
