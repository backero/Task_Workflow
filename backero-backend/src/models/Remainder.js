const mongoose = require('mongoose');

const RemainderSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: String,
    type: {
      type: String,
      enum: ['Follow-up', 'Approval', 'Payment', 'Document', 'Custom'],
      default: 'Custom'
    },
    dueDate: {
      type: Date,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Done', 'Overdue'],
      default: 'Pending',
      index: true
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium'
    },
    notes: String,
    completedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reminderSentDates: [Date],
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

RemainderSchema.index({ organizationId: 1, status: 1, dueDate: 1 });
RemainderSchema.index({ organizationId: 1, createdBy: 1, status: 1 });

module.exports = mongoose.model('Remainder', RemainderSchema);
