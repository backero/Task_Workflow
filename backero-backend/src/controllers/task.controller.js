const Task = require('../models/Task');
const TaskApproval = require('../models/TaskApproval');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { TASK_STATUS, SOCKET_EVENTS, ROLES, ROLE_HIERARCHY } = require('../utils/constants');
const { createNotification } = require('../services/notification.service');
const { sendTaskAssigned } = require('../services/whatsapp.service');

// GET /api/tasks
exports.getTasks = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, priority, department, assignedTo, platform, search, isOverdue, dateFrom, dateTo } = req.query;
  const { skip } = paginate(page, limit);

  const filter = { organizationId: req.user.organizationId };

  // Role-based task visibility
  const userRole = req.user.role;
  const userLevel = ROLE_HIERARCHY[userRole] || 1;

  if (userLevel <= 2) {
    // member / team_lead: only their own tasks
    filter.$or = [{ assignedTo: req.user._id }, { assignedBy: req.user._id }, { watchers: req.user._id }];
  } else if (userLevel === 3) {
    // manager: only their department's tasks
    if (req.user.department) filter.department = req.user.department;
  }
  // admin (4) and above: see everything — no extra filter

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (department) filter.department = department;
  if (platform) filter.platform = platform;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (isOverdue === 'true') filter.isOverdue = true;
  if (dateFrom || dateTo) {
    filter.dueDate = {};
    if (dateFrom) filter.dueDate.$gte = new Date(dateFrom);
    if (dateTo) filter.dueDate.$lte = new Date(dateTo);
  }
  if (search) filter.$or = [{ title: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }];

  // Root-only filter (board view — exclude subtasks)
  if (req.query.rootOnly === 'true') {
    filter.$or = [{ parentTask: null }, { parentTask: { $exists: false } }];
  }

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('assignedTo', 'firstName lastName avatar role department')
      .populate('assignedBy', 'firstName lastName avatar')
      .populate('reportingManager', 'firstName lastName')
      .populate('subTasks', 'status title')
      .sort({ priority: -1, dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Task.countDocuments(filter),
  ]);

  sendSuccess(res, paginateResponse(tasks, total, page, limit));
});

// POST /api/tasks
exports.createTask = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { title, description, department, assignedTo, priority, dueDate, estimatedHours, tags, taskType, platform, relatedTo, isRecurring, recurringConfig, parentTask, watchers } = req.body;

  // Validate assignee & department-based assignment rules
  if (assignedTo) {
    const assignee = await User.findOne({ _id: assignedTo, organizationId: req.user.organizationId });
    if (!assignee) return sendError(res, 'Assigned user not found in your organization.', 404);

    const userLevel = ROLE_HIERARCHY[req.user.role] || 1;
    // Manager (level 3) can only assign within their own department
    if (userLevel === 3 && req.user.department && assignee.department !== req.user.department) {
      return sendError(res, `Managers can only assign tasks to members in their own department (${req.user.department}).`, 403);
    }
  }

  const task = await Task.create({
    organizationId: req.user.organizationId,
    title, description, department, assignedTo, priority, dueDate, estimatedHours, tags, taskType, platform, relatedTo, isRecurring, recurringConfig, parentTask, watchers,
    assignedBy: req.user._id,
    reportingManager: req.user._id,
    status: assignedTo ? TASK_STATUS.ASSIGNED : TASK_STATUS.PENDING,
    createdBy: req.user._id,
    updatedBy: req.user._id,
    activity: [{ action: 'Task created', performedBy: req.user._id, details: { title } }],
  });

  // If subtask, add to parent
  if (parentTask) {
    await Task.findByIdAndUpdate(parentTask, { $push: { subTasks: task._id } });
  }

  const populatedTask = await Task.findById(task._id)
    .populate('assignedTo', 'firstName lastName avatar role department')
    .populate('assignedBy', 'firstName lastName');

  // Notify assignee — in-app + WhatsApp
  if (assignedTo) {
    await createNotification({
      organizationId: req.user.organizationId,
      recipient: assignedTo,
      title: 'New Task Assigned',
      message: `"${title}" has been assigned to you by ${req.user.firstName} ${req.user.lastName}. Priority: ${priority || 'medium'}. Due: ${dueDate ? new Date(dueDate).toLocaleDateString('en-IN') : 'Not set'}`,
      type: 'task',
      priority: priority === 'critical' || priority === 'urgent' ? 'high' : 'medium',
      actionUrl: `/tasks/${task._id}`,
      reference: { model: 'Task', id: task._id },
      channels: { inApp: true, whatsapp: false },
    }, io);

    // Direct WhatsApp with rich formatting
    const assigneeUser = await User.findById(assignedTo).select('phone whatsapp');
    if (assigneeUser) {
      const phone = assigneeUser.whatsapp || assigneeUser.phone;
      if (phone) {
        sendTaskAssigned(phone, {
          title,
          assignedByName: `${req.user.firstName} ${req.user.lastName}`,
          priority,
          department,
          dueDate,
          description,
        }).catch(() => {});
      }
    }
  }

  await ActivityLog.create({
    organizationId: req.user.organizationId,
    performedBy: req.user._id,
    action: 'task_created',
    module: 'task',
    reference: { model: 'Task', id: task._id, title: task.title },
    department,
  });

  // Emit real-time event
  io?.to(`org:${req.user.organizationId}`).emit(SOCKET_EVENTS.TASK_CREATED, { task: populatedTask });

  sendSuccess(res, { task: populatedTask }, 'Task created successfully', 201);
});

// GET /api/tasks/:id
exports.getTask = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
    .populate('assignedTo', 'firstName lastName avatar role department phone whatsapp')
    .populate('assignedBy', 'firstName lastName avatar role')
    .populate('reportingManager', 'firstName lastName avatar')
    .populate('watchers', 'firstName lastName avatar')
    .populate('comments.author', 'firstName lastName avatar')
    .populate('activity.performedBy', 'firstName lastName')
    .populate('extensionRequests.requestedBy', 'firstName lastName')
    .populate('extensionRequests.reviewedBy', 'firstName lastName')
    .populate('parentTask', 'title status')
    .populate('subTasks', 'title status priority assignedTo');

  if (!task) return sendError(res, 'Task not found.', 404);
  sendSuccess(res, { task });
});

// PUT /api/tasks/:id
exports.updateTask = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!task) return sendError(res, 'Task not found.', 404);

  const userRole = req.user.role;
  const isEmployee = userRole === ROLES.MEMBER || userRole === ROLES.TEAM_LEAD;
  const isAssignee = task.assignedTo?.toString() === req.user._id.toString();

  // Employees can only update progress, attachments, comments, blockers
  const allowedForEmployee = ['progress', 'proofOfWork', 'blockers', 'actualHours'];
  const updates = req.body;

  if (isEmployee && !isAssignee) {
    return sendError(res, 'You can only update tasks assigned to you.', 403);
  }

  // Build safe update
  const safeUpdate = isEmployee
    ? Object.fromEntries(Object.entries(updates).filter(([k]) => allowedForEmployee.includes(k)))
    : updates;

  const previousStatus = task.status;

  // Track activity
  const activityEntry = {
    action: 'Task updated',
    performedBy: req.user._id,
    details: safeUpdate,
    previousValue: { status: task.status, progress: task.progress },
  };

  Object.assign(task, safeUpdate);
  task.updatedBy = req.user._id;
  task.activity.push(activityEntry);
  await task.save();

  const populatedTask = await Task.findById(task._id)
    .populate('assignedTo', 'firstName lastName avatar')
    .populate('assignedBy', 'firstName lastName');

  io?.to(`task:${task._id}`).emit(SOCKET_EVENTS.TASK_UPDATED, { task: populatedTask });
  io?.to(`org:${req.user.organizationId}`).emit(SOCKET_EVENTS.TASK_UPDATED, { taskId: task._id, updates: safeUpdate });

  sendSuccess(res, { task: populatedTask }, 'Task updated successfully');
});

// GET /api/tasks/:id/approvals
exports.getTaskApprovals = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!task) return sendError(res, 'Task not found.', 404);

  const approvals = await TaskApproval.find({ taskId: req.params.id, organizationId: req.user.organizationId })
    .populate('requestedBy', 'firstName lastName avatar')
    .populate('reviewedBy', 'firstName lastName avatar')
    .sort({ requestedAt: -1 });

  sendSuccess(res, { approvals });
});

// POST /api/tasks/:id/request-completion
exports.requestCompletion = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { notes, attachments } = req.body;

  const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!task) return sendError(res, 'Task not found.', 404);

  if (task.assignedTo?.toString() !== req.user._id.toString()) {
    return sendError(res, 'Only the assignee can request completion.', 403);
  }

  if (![TASK_STATUS.IN_PROGRESS, TASK_STATUS.ASSIGNED, TASK_STATUS.REOPENED, TASK_STATUS.CHANGES_REQUESTED].includes(task.status)) {
    return sendError(res, `Cannot request completion from status: ${task.status}`, 400);
  }

  // Prevent duplicate pending approvals
  const existingPending = await TaskApproval.findOne({ taskId: task._id, organizationId: req.user.organizationId, status: 'pending' });
  if (existingPending) return sendError(res, 'A completion request is already pending review.', 400);

  // Create approval request
  const approval = await TaskApproval.create({
    organizationId: req.user.organizationId,
    taskId: task._id,
    requestedBy: req.user._id,
    requestNotes: notes,
    attachments,
    status: 'pending',
    requestedAt: new Date(),
    round: task.rejectionCount + 1,
    createdBy: req.user._id,
  });

  task.status = TASK_STATUS.APPROVAL_PENDING;
  task.activity.push({ action: 'Completion requested', performedBy: req.user._id, details: { notes } });
  task.updatedBy = req.user._id;
  await task.save();

  // Notify manager/assignedBy
  const notifyUserId = task.reportingManager || task.assignedBy;
  await createNotification({
    organizationId: req.user.organizationId,
    recipient: notifyUserId,
    title: 'Task Completion Requested',
    message: `${req.user.firstName} ${req.user.lastName} has requested completion for "${task.title}"`,
    type: 'approval',
    priority: 'high',
    actionUrl: `/approvals/${approval._id}`,
    reference: { model: 'Task', id: task._id },
    channels: { inApp: true, whatsapp: true },
  }, io);

  io?.to(`org:${req.user.organizationId}`).emit(SOCKET_EVENTS.TASK_REVIEW_REQUESTED, { taskId: task._id, approval });

  sendSuccess(res, { approval }, 'Completion request submitted');
});

// POST /api/tasks/:id/daily-update
exports.addDailyUpdate = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { content, progress, hoursWorked } = req.body;
  if (!content?.trim()) return sendError(res, 'Update content is required.', 400);

  const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!task) return sendError(res, 'Task not found.', 404);

  const isAssignee = task.assignedTo?.toString() === req.user._id.toString();
  const userLevel = ROLE_HIERARCHY[req.user.role] || 1;
  if (!isAssignee && userLevel < 3) return sendError(res, 'You can only update tasks assigned to you.', 403);

  task.comments.push({
    author: req.user._id,
    content: content.trim(),
    type: 'daily_update',
    progress: progress ?? task.progress,
    hoursWorked: hoursWorked || 0,
  });

  if (progress !== undefined) task.progress = Math.min(100, Math.max(0, Number(progress)));
  if (hoursWorked) task.actualHours = (task.actualHours || 0) + Number(hoursWorked);
  if (task.status === 'Assigned') task.status = 'In Progress';

  task.activity.push({ action: 'daily_update', performedBy: req.user._id, details: { progress: task.progress } });
  await task.save();

  const populated = await Task.findById(task._id).populate('comments.author', 'firstName lastName avatar');
  const newUpdate = populated.comments[populated.comments.length - 1];

  io?.to(`task:${task._id}`).emit('daily_update_added', { taskId: task._id, update: newUpdate, progress: task.progress });

  // Notify assignedBy if different
  if (task.assignedBy?.toString() !== req.user._id.toString()) {
    await createNotification({
      organizationId: req.user.organizationId,
      recipient: task.assignedBy,
      title: 'Task Update Posted',
      message: `${req.user.firstName} posted a daily update on "${task.title}"`,
      type: 'task',
      priority: 'low',
      actionUrl: `/tasks/my`,
      reference: { model: 'Task', id: task._id },
      channels: { inApp: true },
    }, io);
  }

  sendSuccess(res, { update: newUpdate, task: { progress: task.progress, status: task.status } }, 'Update posted');
});

// POST /api/tasks/:id/comment
exports.addComment = asyncHandler(async (req, res) => {
  const { content, isInternal, attachments } = req.body;

  const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!task) return sendError(res, 'Task not found.', 404);

  task.comments.push({ author: req.user._id, content, isInternal: isInternal || false, attachments });
  await task.save();

  const populatedTask = await Task.findById(task._id).populate('comments.author', 'firstName lastName avatar');
  const newComment = populatedTask.comments[populatedTask.comments.length - 1];

  req.app.get('io')?.to(`task:${task._id}`).emit('comment_added', { taskId: task._id, comment: newComment });

  sendSuccess(res, { comment: newComment }, 'Comment added');
});

// POST /api/tasks/:id/extension-request
exports.requestExtension = asyncHandler(async (req, res) => {
  const { requestedDueDate, reason } = req.body;
  const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!task) return sendError(res, 'Task not found.', 404);
  if (task.assignedTo?.toString() !== req.user._id.toString()) {
    return sendError(res, 'Only the assignee can request extension.', 403);
  }

  task.extensionRequests.push({
    requestedBy: req.user._id,
    originalDueDate: task.dueDate,
    requestedDueDate,
    reason,
    status: 'pending',
    requestedAt: new Date(),
  });
  await task.save();

  await createNotification({
    organizationId: req.user.organizationId,
    recipient: task.assignedBy,
    title: 'Extension Request',
    message: `${req.user.firstName} has requested an extension for "${task.title}"`,
    type: 'task',
    priority: 'medium',
    actionUrl: `/tasks/${task._id}`,
    reference: { model: 'Task', id: task._id },
    channels: { inApp: true, whatsapp: true },
  }, req.app.get('io'));

  sendSuccess(res, {}, 'Extension request submitted');
});

// GET /api/tasks/extension-requests — manager: tasks with pending extension requests
exports.getExtensionRequests = asyncHandler(async (req, res) => {
  const filter = {
    organizationId: req.user.organizationId,
    'extensionRequests.status': 'pending',
  };

  const level = ROLE_HIERARCHY[req.user.role] || 1;
  if (level === 3 && req.user.department) filter.department = req.user.department;

  const tasks = await Task.find(filter)
    .populate('assignedTo', 'firstName lastName avatar')
    .populate('assignedBy', 'firstName lastName')
    .populate('extensionRequests.requestedBy', 'firstName lastName')
    .select('title department status dueDate extensionRequests assignedTo assignedBy priority')
    .lean();

  const result = tasks.map((t) => ({
    ...t,
    extensionRequests: t.extensionRequests.filter((e) => e.status === 'pending'),
  }));

  sendSuccess(res, { tasks: result });
});

// PATCH /api/tasks/:id/extension-request/:reqId — manager approves or rejects
exports.reviewExtensionRequest = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return sendError(res, 'Status must be approved or rejected.', 400);
  }

  const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
    .populate('assignedTo', 'firstName lastName');
  if (!task) return sendError(res, 'Task not found.', 404);

  const request = task.extensionRequests.id(req.params.reqId);
  if (!request) return sendError(res, 'Extension request not found.', 404);
  if (request.status !== 'pending') return sendError(res, 'This request has already been reviewed.', 400);

  request.status = status;
  request.reviewedBy = req.user._id;
  request.reviewedAt = new Date();

  if (status === 'approved') {
    task.dueDate = request.requestedDueDate;
    task.isOverdue = false;
    task.activity.push({
      action: `Deadline extended to ${new Date(request.requestedDueDate).toLocaleDateString('en-IN')}`,
      performedBy: req.user._id,
    });
  }

  task.updatedBy = req.user._id;
  await task.save();

  const notifMsg = status === 'approved'
    ? `Extension approved for "${task.title}" — new deadline: ${new Date(request.requestedDueDate).toLocaleDateString('en-IN')}`
    : `Extension request rejected for "${task.title}"`;

  await createNotification({
    organizationId: req.user.organizationId,
    recipient: task.assignedTo._id || task.assignedTo,
    title: `Extension Request ${status === 'approved' ? 'Approved' : 'Rejected'}`,
    message: notifMsg,
    type: 'task',
    priority: 'medium',
    actionUrl: `/tasks/${task._id}`,
    reference: { model: 'Task', id: task._id },
    channels: { inApp: true, whatsapp: true },
  }, req.app.get('io'));

  req.app.get('io')?.to(`org:${req.user.organizationId}`).emit(SOCKET_EVENTS.TASK_UPDATED, {
    taskId: task._id,
    updates: { dueDate: task.dueDate },
  });

  sendSuccess(res, {}, `Extension request ${status}`);
});

// POST /api/tasks/:id/start — assignee marks task as In Progress
exports.startTask = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!task) return sendError(res, 'Task not found.', 404);

  if (task.assignedTo?.toString() !== req.user._id.toString()) {
    return sendError(res, 'Only the assignee can start this task.', 403);
  }
  if (task.status !== TASK_STATUS.ASSIGNED) {
    return sendError(res, `Cannot start a task with status: ${task.status}`, 400);
  }

  task.status = TASK_STATUS.IN_PROGRESS;
  task.startedAt = new Date();
  task.activity.push({ action: 'Task started', performedBy: req.user._id, details: {} });
  task.updatedBy = req.user._id;
  await task.save();

  const populatedTask = await Task.findById(task._id)
    .populate('assignedTo', 'firstName lastName avatar')
    .populate('assignedBy', 'firstName lastName');

  io?.to(`org:${req.user.organizationId}`).emit(SOCKET_EVENTS.TASK_UPDATED, { taskId: task._id, updates: { status: task.status } });

  // Notify assigner
  if (task.assignedBy?.toString() !== req.user._id.toString()) {
    await createNotification({
      organizationId: req.user.organizationId,
      recipient: task.assignedBy,
      title: 'Task Started',
      message: `${req.user.firstName} ${req.user.lastName} has started working on "${task.title}"`,
      type: 'task', priority: 'low',
      actionUrl: `/tasks/${task._id}`,
      reference: { model: 'Task', id: task._id },
      channels: { inApp: true },
    }, io);
  }

  sendSuccess(res, { task: populatedTask }, 'Task started');
});

// GET /api/tasks/analytics
exports.getAnalytics = asyncHandler(async (req, res) => {
  const { department, dateFrom, dateTo } = req.query;
  const orgId = req.user.organizationId;

  const filter = { organizationId: orgId };
  if (department) filter.department = department;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const [statusBreakdown, priorityBreakdown, departmentBreakdown, overdueTasks, completionRate] = await Promise.all([
    Task.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Task.aggregate([{ $match: filter }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Task.aggregate([{ $match: filter }, { $group: { _id: '$department', count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } } } }]),
    Task.countDocuments({ ...filter, isOverdue: true }),
    Task.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } } } },
    ]),
  ]);

  const total = completionRate[0]?.total || 0;
  const completed = completionRate[0]?.completed || 0;

  sendSuccess(res, {
    analytics: {
      statusBreakdown,
      priorityBreakdown,
      departmentBreakdown,
      overdueTasks,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalTasks: total,
      completedTasks: completed,
    },
  });
});

// DELETE /api/tasks/:id
exports.deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!task) return sendError(res, 'Task not found.', 404);

  if (ROLE_HIERARCHY[req.user.role] < ROLE_HIERARCHY['manager']) {
    return sendError(res, 'Only managers and above can delete tasks.', 403);
  }

  await Task.findByIdAndDelete(task._id);
  await ActivityLog.create({
    organizationId: req.user.organizationId,
    performedBy: req.user._id,
    action: 'task_deleted',
    module: 'task',
    reference: { model: 'Task', id: task._id, title: task.title },
  });

  sendSuccess(res, {}, 'Task deleted');
});
