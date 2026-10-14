const mongoose = require('mongoose');
const { TASK_STATUS, TASK_PRIORITY } = require('../utils/constants');

// NOTE: these must be explicit Schema instances, not plain object literals — a plain
// `[{ url: String, name: String, type: String, size: Number }]` array element gets
// misread by Mongoose as a `{ type: <SchemaType> }` type descriptor (because the
// object has a `type` key), silently collapsing the whole field into an array of
// strings instead of subdocuments.
const attachmentSchema = new mongoose.Schema({
  url: String, name: String, type: String, size: Number,
}, { _id: false });

const proofOfWorkSchema = new mongoose.Schema({
  url: String, name: String, type: String, uploadedAt: Date,
}, { _id: false });

const taskAttachmentSchema = new mongoose.Schema({
  url: String, name: String, type: String, size: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });

const commentSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['comment', 'daily_update'], default: 'comment' },
  progress: { type: Number },
  hoursWorked: { type: Number },
  attachments: [attachmentSchema],
  isInternal: { type: Boolean, default: false },
}, { timestamps: true });

const activitySchema = new mongoose.Schema({
  action: { type: String, required: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  details: { type: mongoose.Schema.Types.Mixed },
  previousValue: { type: mongoose.Schema.Types.Mixed },
  newValue: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, maxlength: 5000 },
  department: { type: String, required: true },
  taskType: { type: String },
  platform: { type: String },

  // Assignment
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  watchers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Status & Priority
  status: { type: String, enum: Object.values(TASK_STATUS), default: TASK_STATUS.PENDING, index: true },
  priority: { type: String, enum: Object.values(TASK_PRIORITY), default: TASK_PRIORITY.MEDIUM, index: true },
  progress: { type: Number, min: 0, max: 100, default: 0 },

  // Dates
  dueDate: { type: Date, index: true },
  startDate: { type: Date },
  completedAt: { type: Date },
  estimatedHours: { type: Number },
  actualHours: { type: Number },

  // Tags & References
  tags: [{ type: String }],
  relatedTo: {
    model: { type: String, enum: ['Lead', 'ProductionOrder', 'Campaign', 'MarketplaceTask'] },
    id: { type: mongoose.Schema.Types.ObjectId },
  },
  parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  subTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],

  // Attachments & Proof
  attachments: [taskAttachmentSchema],
  proofOfWork: [proofOfWorkSchema],

  // Blockers
  blockers: [{
    description: String,
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reportedAt: Date,
    resolvedAt: Date,
    isResolved: { type: Boolean, default: false },
  }],

  // Extension requests
  extensionRequests: [{
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    originalDueDate: Date,
    requestedDueDate: Date,
    reason: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    requestedAt: Date,
  }],

  // Metrics
  isOverdue: { type: Boolean, default: false },
  overdueNotificationsSent: { type: Number, default: 0 },
  lastReminderSent: { type: Date },
  rejectionCount: { type: Number, default: 0 },

  // Comments & Activity
  comments: [commentSchema],
  activity: [activitySchema],

  // Recurring task config
  isRecurring: { type: Boolean, default: false },
  recurringConfig: {
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'custom'] },
    interval: Number,
    endDate: Date,
    nextRunDate: Date,
  },

  // ── Workflow / Hierarchy fields ────────────────────────────────────────────
  level: { type: Number, default: 0, index: true },           // 0 = root main task
  path:  { type: String, index: true },                       // materialized path: "rootId/parentId/thisId"
  autoProgress: { type: Boolean, default: false },             // compute progress from children
  completionLocked: { type: Boolean, default: false },         // cannot be completed yet
  completionLockReasons: [{ type: String }],
  workflowData: {
    x:         { type: Number },
    y:         { type: Number },
    collapsed: { type: Boolean, default: false },
  },

  // Cross-manager assignment pending admin approval
  pendingManagerAssignment: {
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    pendingAssignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: { type: Date },
    reviewedAt: { type: Date },
  },

  // Dept Hub flag — true on root tasks created via the DeptHub modal
  isDeptHub: { type: Boolean, default: false, index: true },

  // Dept Hub approval (set on root hub tasks created by managers)
  pendingHubApproval: { type: Boolean, default: false, index: true },
  hubApproval: {
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },

  // ── Time Tracker ──────────────────────────────────────────────────────────
  timerSessions: [{
    startedAt: { type: Date },
    stoppedAt: { type: Date },
    durationMs: { type: Number, default: 0 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
  }],
  totalTrackedMs: { type: Number, default: 0 },
  activeTimer: {
    startedAt: { type: Date },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Archive (completed root tasks are auto-archived)
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date },
}, { timestamps: true });

// Indexes for performance
taskSchema.index({ organizationId: 1, status: 1, department: 1 });
taskSchema.index({ organizationId: 1, assignedTo: 1, status: 1 });
taskSchema.index({ organizationId: 1, dueDate: 1, isOverdue: 1 });
taskSchema.index({ organizationId: 1, assignedBy: 1 });
taskSchema.index({ organizationId: 1, department: 1, platform: 1 });

const TERMINAL_STATUSES = ['Completed', 'Achieved', 'Cancelled'];

// Auto-set isOverdue on save — always clear it for terminal statuses
taskSchema.pre('save', function (next) {
  if (TERMINAL_STATUSES.includes(this.status)) {
    this.isOverdue = false;
  } else if (this.dueDate) {
    this.isOverdue = new Date() > this.dueDate;
  }
  next();
});

// Always compute isOverdue live in API responses so stale DB value never misleads clients
taskSchema.set('toJSON', {
  transform: (doc, ret) => {
    if (TERMINAL_STATUSES.includes(doc.status)) {
      ret.isOverdue = false;
    } else if (doc.dueDate) {
      ret.isOverdue = new Date() > doc.dueDate;
    }
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Task', taskSchema);
