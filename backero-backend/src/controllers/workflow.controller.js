const Task = require('../models/Task');
const TaskApproval = require('../models/TaskApproval');
const TaskDependency = require('../models/TaskDependency');
const WorkflowTemplate = require('../models/WorkflowTemplate');
const workflowEngine = require('../services/workflowEngine.service');
const dependencyService = require('../services/dependency.service');
const { createNotification } = require('../services/notification.service');
const { TASK_STATUS, SOCKET_EVENTS, ROLES } = require('../utils/constants');
const MANAGER_ROLES = ['super_admin', 'chairman', 'founder', 'admin', 'manager', 'team_lead'];
const logger = require('../utils/logger');

// ── Graph / Tree ─────────────────────────────────────────────────────────────

const getWorkflowGraph = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId = req.user.organizationId;

    const task = await Task.findOne({ _id: taskId, organizationId: orgId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const [graph, tree] = await Promise.all([
      workflowEngine.buildWorkflowGraph(taskId),
      workflowEngine.buildTaskTree(taskId),
    ]);

    res.json({ success: true, data: { graph, tree, task } });
  } catch (err) {
    logger.error('getWorkflowGraph:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getTaskTree = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId = req.user.organizationId;

    const task = await Task.findOne({ _id: taskId, organizationId: orgId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const tree = await workflowEngine.buildTaskTree(taskId);
    res.json({ success: true, data: tree });
  } catch (err) {
    logger.error('getTaskTree:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Subtask management ────────────────────────────────────────────────────────

const addSubtask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId  = req.user.organizationId;
    const userId = req.user._id;
    const { title, description, assignedTo, priority, dueDate, estimatedHours, department, positionX, positionY, platform } = req.body;

    if (!title?.trim()) return res.status(400).json({ success: false, message: 'Title is required' });

    const parent = await Task.findOne({ _id: taskId, organizationId: orgId });
    if (!parent) return res.status(404).json({ success: false, message: 'Parent task not found' });

    const subtask = new Task({
      organizationId: orgId,
      title: title.trim(),
      description,
      department: department || parent.department,
      platform:   platform  || parent.platform || undefined,
      priority: priority || 'medium',
      status: assignedTo ? TASK_STATUS.ASSIGNED : TASK_STATUS.PENDING,
      assignedTo:       assignedTo || undefined,
      assignedBy:       userId,
      reportingManager: userId,
      dueDate:          dueDate ? new Date(dueDate) : undefined,
      estimatedHours,
      parentTask:  taskId,
      level:       (parent.level || 0) + 1,
      autoProgress: true,
      workflowData: { x: positionX || 0, y: positionY || 0 },
      createdBy: userId,
      updatedBy: userId,
    });

    subtask.path = parent.path ? `${parent.path}/${subtask._id}` : `${taskId}/${subtask._id}`;

    await subtask.save();

    // Update parent
    await Task.findByIdAndUpdate(taskId, {
      $push: { subTasks: subtask._id },
      $set:  { autoProgress: true, completionLocked: true, updatedBy: userId },
      $addToSet: { completionLockReasons: 'Has incomplete subtasks' },
    });

    // Advance parent status if still pending/assigned
    if ([TASK_STATUS.PENDING, TASK_STATUS.ASSIGNED].includes(parent.status)) {
      await Task.findByIdAndUpdate(taskId, { status: TASK_STATUS.IN_PROGRESS });
    }

    // Notify assigned member via WhatsApp with full task context
    if (assignedTo) {
      const managerName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Your manager';
      const priorityLabel = (priority || 'medium').charAt(0).toUpperCase() + (priority || 'medium').slice(1);
      const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set';
      const hoursStr = estimatedHours ? `${estimatedHours}h` : 'Not set';

      await createNotification({
        organizationId: orgId,
        recipient: assignedTo,
        title: '📋 New Task Assigned to You',
        message: `${managerName} assigned you a task:\n\n*${title.trim()}*\nPriority: ${priorityLabel} | Due: ${dueDateStr} | Est: ${hoursStr}\nPart of: "${parent.title}"`,
        type: 'task',
        priority: priority || 'medium',
        actionUrl: `/workflow/${taskId}`,
        reference: { model: 'Task', id: subtask._id },
        channels: { inApp: true, whatsapp: true },
        createdBy: userId,
      }, req.app.get('io'));
    }

    req.app.get('io')?.to(`org:${orgId}`).emit(SOCKET_EVENTS.TASK_CREATED, { task: subtask });

    res.status(201).json({ success: true, data: subtask });
  } catch (err) {
    logger.error('addSubtask:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Start task (Assigned → In Progress) ──────────────────────────────────────

const startTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId  = req.user.organizationId;
    const userId = req.user._id;

    const task = await Task.findOne({ _id: taskId, organizationId: orgId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    if (!['Pending', 'Assigned', 'Reopened'].includes(task.status)) {
      return res.status(400).json({ success: false, message: 'Task cannot be started from current status' });
    }

    task.status = TASK_STATUS.IN_PROGRESS;
    task.updatedBy = userId;
    await task.save();

    req.app.get('io')?.to(`org:${orgId}`).emit(SOCKET_EVENTS.TASK_UPDATED, { taskId, status: task.status });
    res.json({ success: true, data: task });
  } catch (err) {
    logger.error('startTask:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Add daily update ──────────────────────────────────────────────────────────

const addUpdate = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId  = req.user.organizationId;
    const userId = req.user._id;
    const { content, progress, hoursWorked } = req.body;

    if (!content?.trim()) return res.status(400).json({ success: false, message: 'Update content required' });

    const task = await Task.findOne({ _id: taskId, organizationId: orgId }).populate('assignedBy', 'firstName lastName phone whatsapp');
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    task.comments = task.comments || [];
    task.comments.push({
      type: 'daily_update',
      content: content.trim(),
      author: userId,
      hoursWorked: hoursWorked ? Number(hoursWorked) : undefined,
      createdAt: new Date(),
    });

    const childCount = await Task.countDocuments({ parentTask: taskId });
    if (childCount === 0 && progress != null) {
      task.progress = Math.min(100, Math.max(0, Number(progress)));
    }
    if (hoursWorked) task.actualHours = (task.actualHours || 0) + Number(hoursWorked);
    if (task.status === TASK_STATUS.ASSIGNED) task.status = TASK_STATUS.IN_PROGRESS;

    task.updatedBy = userId;
    await task.save();

    if (task.parentTask) await workflowEngine.propagateProgress(task.parentTask);

    req.app.get('io')?.to(`org:${orgId}`).emit(SOCKET_EVENTS.TASK_UPDATED, { taskId, progress: task.progress, status: task.status });
    res.json({ success: true, data: task });
  } catch (err) {
    logger.error('addUpdate:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Node positions ────────────────────────────────────────────────────────────

const updateNodePositions = async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const { positions } = req.body; // [{ taskId, x, y }]

    if (!Array.isArray(positions)) return res.status(400).json({ success: false, message: 'positions must be an array' });

    await Promise.all(positions.map(({ taskId, x, y }) =>
      Task.findOneAndUpdate(
        { _id: taskId, organizationId: orgId },
        { 'workflowData.x': x, 'workflowData.y': y }
      )
    ));

    res.json({ success: true });
  } catch (err) {
    logger.error('updateNodePositions:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Dependencies ──────────────────────────────────────────────────────────────

const addDependency = async (req, res) => {
  try {
    const orgId  = req.user.organizationId;
    const userId = req.user._id;
    const { fromTaskId, toTaskId, type } = req.body;

    const [from, to] = await Promise.all([
      Task.findOne({ _id: fromTaskId, organizationId: orgId }),
      Task.findOne({ _id: toTaskId,   organizationId: orgId }),
    ]);

    if (!from || !to) return res.status(404).json({ success: false, message: 'Task not found' });

    const dep = await dependencyService.addDependency(fromTaskId, toTaskId, type, orgId, userId);

    req.app.get('io')?.to(`org:${orgId}`).emit('dependency_added', { dep });

    res.status(201).json({ success: true, data: dep });
  } catch (err) {
    logger.error('addDependency:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

const removeDependency = async (req, res) => {
  try {
    const dep = await dependencyService.removeDependency(req.params.depId, req.user._id);
    req.app.get('io')?.to(`org:${req.user.organizationId}`).emit('dependency_removed', { depId: req.params.depId });
    res.json({ success: true, data: dep });
  } catch (err) {
    logger.error('removeDependency:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

const getTaskDependencies = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId = req.user.organizationId;

    const [incoming, outgoing] = await Promise.all([
      TaskDependency.find({ toTask: taskId, organizationId: orgId })
        .populate('fromTask', 'title status priority'),
      TaskDependency.find({ fromTask: taskId, organizationId: orgId })
        .populate('toTask', 'title status priority'),
    ]);

    res.json({ success: true, data: { incoming, outgoing } });
  } catch (err) {
    logger.error('getTaskDependencies:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Completion check ──────────────────────────────────────────────────────────

const checkCompletion = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId = req.user.organizationId;

    const task = await Task.findOne({ _id: taskId, organizationId: orgId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const result = await workflowEngine.checkCompletionEligibility(taskId);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('checkCompletion:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Request completion (employee/manager → approval) ─────────────────────────

const requestCompletion = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId  = req.user.organizationId;
    const userId = req.user._id;
    const { notes } = req.body;

    const task = await Task.findOne({ _id: taskId, organizationId: orgId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const isManager = MANAGER_ROLES.includes(req.user.role);
    const isAssignee = task.assignedTo?.toString() === userId.toString();
    if (!isManager && !isAssignee) {
      return res.status(403).json({ success: false, message: 'Not authorized to request completion for this task' });
    }

    // Only managers can submit parent tasks
    const childCount = await Task.countDocuments({ parentTask: taskId });
    if (childCount > 0 && !isManager) {
      return res.status(403).json({ success: false, message: 'Only managers can submit tasks with subtasks for completion' });
    }

    const { eligible, reasons } = await workflowEngine.checkCompletionEligibility(taskId);
    if (!eligible) {
      return res.status(400).json({ success: false, message: 'Cannot submit for completion yet', reasons });
    }

    task.status = TASK_STATUS.APPROVAL_PENDING;
    await task.save();

    // Find existing pending approval round
    const lastApproval = await TaskApproval.findOne({ taskId }).sort({ round: -1 });
    const round = (lastApproval?.round || 0) + 1;

    await TaskApproval.create({
      organizationId: orgId,
      taskId,
      requestedBy: userId,
      requestNotes: notes,
      status: 'pending',
      requestedAt: new Date(),
      round,
      createdBy: userId,
    });

    const User = require('../models/User');
    const isRootTask = !task.parentTask; // root = no parent, assigned by admin to manager

    const submitterName = `${req.user.firstName} ${req.user.lastName}`.trim();

    if (isRootTask) {
      // Manager submitting main task → notify the specific admin who assigned it
      // + any other org admins as backup
      const adminRoles = ['admin', 'founder', 'chairman', 'super_admin'];
      const primaryApprover = task.assignedBy?.toString();

      // Always notify the specific assigner first
      if (primaryApprover && primaryApprover !== userId.toString()) {
        await createNotification({
          organizationId: orgId,
          recipient: task.assignedBy,
          title: '📋 Main Task Awaiting Your Approval',
          message: `${submitterName} has submitted "${task.title}" for final approval. All subtasks are complete. Please review and approve.`,
          type: 'task',
          priority: 'high',
          actionUrl: `/workflow/${task._id}`,
          reference: { model: 'Task', id: task._id },
          channels: { inApp: true, whatsapp: true },
          createdBy: userId,
        }, req.app.get('io'));
      }

      // Also notify other admins if the assigner wasn't already an admin
      const assignerRole = (await User.findById(task.assignedBy).select('role'))?.role;
      if (!adminRoles.includes(assignerRole)) {
        const admins = await User.find({
          organizationId: orgId,
          role: { $in: adminRoles },
          isActive: true,
        }).select('_id');
        for (const admin of admins) {
          if (admin._id.toString() !== userId.toString() && admin._id.toString() !== primaryApprover) {
            await createNotification({
              organizationId: orgId,
              recipient: admin._id,
              title: '📋 Main Task Awaiting Admin Approval',
              message: `${submitterName} submitted "${task.title}" for final approval.`,
              type: 'task',
              priority: 'high',
              actionUrl: `/workflow/${task._id}`,
              reference: { model: 'Task', id: task._id },
              channels: { inApp: true, whatsapp: true },
              createdBy: userId,
            }, req.app.get('io'));
          }
        }
      }
    } else if (task.assignedBy && task.assignedBy.toString() !== userId.toString()) {
      // Member submitting subtask → notify the specific manager who assigned it
      await createNotification({
        organizationId: orgId,
        recipient: task.assignedBy,
        title: '✅ Subtask Awaiting Your Approval',
        message: `${submitterName} has completed "${task.title}" and is requesting your approval.`,
        type: 'task',
        priority: 'high',
        actionUrl: `/workflow/${task.parentTask || task._id}`,
        reference: { model: 'Task', id: task._id },
        channels: { inApp: true, whatsapp: true },
        createdBy: userId,
      }, req.app.get('io'));
    }

    req.app.get('io')?.to(`org:${orgId}`).emit(SOCKET_EVENTS.TASK_REVIEW_REQUESTED, { taskId });

    res.json({ success: true, message: 'Completion request submitted', data: task });
  } catch (err) {
    logger.error('requestCompletion:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Approve & complete ────────────────────────────────────────────────────────

const ADMIN_LEVEL = 4;

const completeTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId  = req.user.organizationId;
    const userId = req.user._id;
    const { approvalId, notes } = req.body;

    const task = await Task.findOne({ _id: taskId, organizationId: orgId })
      .populate('assignedBy', 'role firstName lastName');
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    // ── Approval authority check ──────────────────────────────────────────────
    const callerLevel   = ROLE_HIERARCHY[req.user.role] || 1;
    const isAssigner    = task.assignedBy?._id?.toString() === userId.toString();
    const isRootTask    = !task.parentTask;                   // no parent = main task

    // Rule: only the person who assigned the task can approve it.
    // Exception: any admin (level ≥ 4) can approve a root/main task.
    if (!isAssigner && !(callerLevel >= ADMIN_LEVEL && isRootTask)) {
      return res.status(403).json({
        success: false,
        message: isRootTask
          ? 'Only admin-level users can approve the main task.'
          : 'Only the manager who assigned this task can approve it.',
      });
    }

    const { eligible, reasons } = await workflowEngine.checkCompletionEligibility(taskId);
    if (!eligible) {
      return res.status(400).json({ success: false, message: 'Cannot complete task', reasons });
    }

    task.status = TASK_STATUS.COMPLETED;
    task.completedAt = new Date();
    task.progress = 100;
    task.completionLocked = false;
    task.completionLockReasons = [];
    task.updatedBy = userId;
    await task.save();

    if (approvalId) {
      await TaskApproval.findByIdAndUpdate(approvalId, {
        status: 'approved',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: notes,
        updatedBy: userId,
      });
    }

    // Resolve downstream dependencies
    await dependencyService.resolveOutgoingDependencies(taskId, orgId);

    // Propagate progress to parent
    if (task.parentTask) await workflowEngine.propagateProgress(task.parentTask);

    // Notify assignee
    if (task.assignedTo) {
      await createNotification({
        organizationId: orgId,
        recipient: task.assignedTo,
        title: '🎉 Task Approved & Completed',
        message: `Your task "${task.title}" has been approved!`,
        type: 'task',
        priority: 'medium',
        actionUrl: `/tasks/${task._id}`,
        reference: { model: 'Task', id: task._id },
        channels: { inApp: true, whatsapp: true },
        createdBy: userId,
      }, req.app.get('io'));
    }

    req.app.get('io')?.to(`org:${orgId}`).emit(SOCKET_EVENTS.TASK_APPROVED, { taskId });

    res.json({ success: true, data: task });
  } catch (err) {
    logger.error('completeTask:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Reject / request changes ──────────────────────────────────────────────────

const rejectTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId  = req.user.organizationId;
    const userId = req.user._id;
    const { approvalId, reason } = req.body;

    const task = await Task.findOne({ _id: taskId, organizationId: orgId })
      .populate('assignedBy', 'role');
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    // Same approval authority check
    const callerLevel = ROLE_HIERARCHY[req.user.role] || 1;
    const isAssigner  = task.assignedBy?._id?.toString() === userId.toString();
    const isRootTask  = !task.parentTask;

    if (!isAssigner && !(callerLevel >= ADMIN_LEVEL && isRootTask)) {
      return res.status(403).json({
        success: false,
        message: isRootTask
          ? 'Only admin-level users can reject the main task.'
          : 'Only the manager who assigned this task can request changes.',
      });
    }

    task.status = TASK_STATUS.CHANGES_REQUESTED;
    task.completionLocked = true;
    task.completionLockReasons = [reason || 'Changes requested by reviewer'];
    task.rejectionCount = (task.rejectionCount || 0) + 1;
    task.updatedBy = userId;
    await task.save();

    if (approvalId) {
      await TaskApproval.findByIdAndUpdate(approvalId, {
        status: 'changes_requested',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: reason,
      });
    }

    if (task.assignedTo) {
      await createNotification({
        organizationId: orgId,
        recipient: task.assignedTo,
        title: '🔄 Changes Requested',
        message: `"${task.title}" needs revisions. Reason: ${reason || 'See approval details'}`,
        type: 'task',
        priority: 'high',
        actionUrl: `/tasks/${task._id}`,
        reference: { model: 'Task', id: task._id },
        channels: { inApp: true, whatsapp: true },
        createdBy: userId,
      }, req.app.get('io'));
    }

    req.app.get('io')?.to(`org:${orgId}`).emit(SOCKET_EVENTS.TASK_REJECTED, { taskId });

    res.json({ success: true, data: task });
  } catch (err) {
    logger.error('rejectTask:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Reopen ────────────────────────────────────────────────────────────────────

const reopenTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId  = req.user.organizationId;
    const userId = req.user._id;
    const { reason } = req.body;

    const task = await Task.findOne({ _id: taskId, organizationId: orgId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    task.status = TASK_STATUS.REOPENED;
    task.progress = Math.min(task.progress || 0, 90);
    task.completionLocked = true;
    task.completionLockReasons = [reason || 'Task reopened'];
    task.updatedBy = userId;
    await task.save();

    await workflowEngine.reopenAncestors(taskId);
    if (task.parentTask) await workflowEngine.propagateProgress(task.parentTask);

    req.app.get('io')?.to(`org:${orgId}`).emit('task_reopened', { taskId, reason });

    res.json({ success: true, data: task });
  } catch (err) {
    logger.error('reopenTask:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Progress update ───────────────────────────────────────────────────────────

const updateProgress = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId  = req.user.organizationId;
    const userId = req.user._id;
    const { progress, hoursWorked, status } = req.body;

    const task = await Task.findOne({ _id: taskId, organizationId: orgId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    // Only allow manual progress on leaf tasks (no children) or non-autoProgress tasks
    const childCount = await Task.countDocuments({ parentTask: taskId });
    if (childCount === 0 && progress != null) {
      task.progress = Math.min(100, Math.max(0, progress));
    }

    if (hoursWorked) task.actualHours = (task.actualHours || 0) + hoursWorked;

    if (status) task.status = status;
    else if (task.status === TASK_STATUS.ASSIGNED && (task.progress > 0)) {
      task.status = TASK_STATUS.IN_PROGRESS;
    }

    task.updatedBy = userId;
    await task.save();

    if (task.parentTask) await workflowEngine.propagateProgress(task.parentTask);

    req.app.get('io')?.to(`org:${orgId}`).emit(SOCKET_EVENTS.TASK_UPDATED, {
      taskId, progress: task.progress, status: task.status,
    });

    res.json({ success: true, data: task });
  } catch (err) {
    logger.error('updateProgress:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Templates ─────────────────────────────────────────────────────────────────

const getTemplates = async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const templates = await WorkflowTemplate.find({
      $or: [{ organizationId: orgId }, { isPublic: true }],
    }).populate('createdBy', 'firstName lastName').sort({ usageCount: -1 });

    res.json({ success: true, data: templates });
  } catch (err) {
    logger.error('getTemplates:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const saveTemplate = async (req, res) => {
  try {
    const orgId  = req.user.organizationId;
    const userId = req.user._id;
    const { taskId, name, description, category, isPublic } = req.body;

    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Template name required' });

    const tree = await workflowEngine.buildTaskTree(taskId);
    if (!tree) return res.status(404).json({ success: false, message: 'Task not found' });

    const nodes = [];
    const extractNodes = (node, parentNodeId = null, level = 0) => {
      const nodeId = node._id.toString();
      nodes.push({
        nodeId,
        title: node.title,
        description: node.description,
        level,
        parentNodeId,
        estimatedHours: node.estimatedHours,
        priority: node.priority || 'medium',
        position: { x: node.workflowData?.x || 0, y: node.workflowData?.y || 0 },
        dependencies: [],
      });
      (node.children || []).forEach(c => extractNodes(c, nodeId, level + 1));
    };
    extractNodes(tree);

    const template = await WorkflowTemplate.create({
      organizationId: orgId,
      name: name.trim(),
      description,
      category,
      nodes,
      createdBy: userId,
      isPublic: isPublic || false,
    });

    res.status(201).json({ success: true, data: template });
  } catch (err) {
    logger.error('saveTemplate:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const applyTemplate = async (req, res) => {
  try {
    const { taskId } = req.params;
    const orgId  = req.user.organizationId;
    const userId = req.user._id;
    const { templateId } = req.body;

    const nodeMap = await workflowEngine.applyTemplate(taskId, templateId, userId, orgId);

    const graph = await workflowEngine.buildWorkflowGraph(taskId);
    res.json({ success: true, data: { createdCount: Object.keys(nodeMap).length, graph } });
  } catch (err) {
    logger.error('applyTemplate:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

const deleteTemplate = async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const template = await WorkflowTemplate.findOneAndDelete({ _id: req.params.id, organizationId: orgId });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteTemplate:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getWorkflowGraph, getTaskTree,
  addSubtask, startTask, addUpdate,
  updateNodePositions,
  addDependency, removeDependency, getTaskDependencies,
  checkCompletion, requestCompletion, completeTask, rejectTask, reopenTask,
  updateProgress,
  getTemplates, saveTemplate, applyTemplate, deleteTemplate,
};
