const mongoose = require('mongoose');

const taskDependencySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  fromTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },  // must finish first
  toTask:   { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },  // depends on fromTask
  type: {
    type: String,
    enum: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'],
    default: 'finish_to_start',
  },
  status: {
    type: String,
    enum: ['active', 'resolved', 'waived'],
    default: 'active',
  },
  resolvedAt: { type: Date },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

taskDependencySchema.index({ organizationId: 1, fromTask: 1 });
taskDependencySchema.index({ organizationId: 1, toTask: 1 });
taskDependencySchema.index({ fromTask: 1, toTask: 1 }, { unique: true });

module.exports = mongoose.model('TaskDependency', taskDependencySchema);
