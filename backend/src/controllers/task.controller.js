const Task = require('../models/Task');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const { success, created, notFound, badRequest } = require('../utils/response');
const { emitToOrg, emitToProject, emitToUser } = require('../sockets/index');
const { log } = require('../services/activityLog.service');
const { queueNotification } = require('../queues/index');
const { sendTaskAssigned, sendTaskStatusUpdate } = require('../services/whatsapp.service');
const logger = require('../utils/logger');

const TASK_POPULATE = [
  { path: 'assigneeId', select: 'name phone avatar' },
  { path: 'createdBy',  select: 'name phone' },
  { path: 'labelIds',   select: 'name color' },
];

const createTask = async (req, res) => {
  try {
    const { projectId, assigneeId } = req.body;

    const project = await Project.findOne({ _id: projectId, organizationId: req.user.organizationId });
    if (!project) return notFound(res, 'Project not found');

    const task = await Task.create({
      ...req.body,
      assigneeId: assigneeId || null,
      organizationId: req.user.organizationId,
      createdBy: req.user._id,
    });

    await Project.findByIdAndUpdate(projectId, { $inc: { taskCount: 1 } });

    const populated = await Task.findById(task._id).populate(TASK_POPULATE).lean();

    emitToProject(projectId, 'task:created', { task: populated });
    emitToOrg(req.user.organizationId.toString(), 'task:created', { task: populated });
    emitToOrg(req.user.organizationId.toString(), 'dashboard:stats_updated', {});

    if (assigneeId && assigneeId !== req.user._id.toString()) {
      const notif = await Notification.create({
        userId: assigneeId,
        organizationId: req.user.organizationId,
        type: 'TASK_ASSIGNED',
        title: 'New task assigned',
        message: `"${task.title}" has been assigned to you by ${req.user.name || req.user.phone}`,
        entityType: 'Task',
        entityId: task._id,
        metadata: { projectId, projectTitle: project.title },
      });
      emitToUser(assigneeId, 'notification', notif);
      queueNotification(assigneeId, notif.title, notif.message);

      // WhatsApp notification to assignee
      const assignee = await require('../models/User').findById(assigneeId).select('phone name').lean();
      if (assignee?.phone) {
        sendTaskAssigned(assignee.phone, assignee.name || assignee.phone, task.title, project.title, task.dueDate)
          .catch(err => logger.error(`WA task assign: ${err.message}`));
      }
    }

    await log({ userId: req.user._id, organizationId: req.user.organizationId, action: 'TASK_CREATED', entity: 'Task', entityId: task._id });

    return created(res, { task: populated }, 'Task created');
  } catch (err) {
    logger.error(`createTask: ${err.message}`);
    throw err;
  }
};

const getTasks = async (req, res) => {
  try {
    const { projectId, status, assigneeId, priority, labelId, dueBefore, dueAfter, page = 1, limit = 100 } = req.query;
    const filter = { organizationId: req.user.organizationId };
    if (projectId)  filter.projectId  = projectId;
    if (status)     filter.status     = status;
    if (assigneeId) filter.assigneeId = assigneeId;
    if (priority)   filter.priority   = priority;
    if (labelId)    filter.labelIds   = labelId;
    if (dueBefore || dueAfter) {
      filter.dueDate = {};
      if (dueBefore) filter.dueDate.$lte = new Date(dueBefore);
      if (dueAfter)  filter.dueDate.$gte = new Date(dueAfter);
    }

    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .sort({ order: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate(TASK_POPULATE)
        .lean(),
      Task.countDocuments(filter),
    ]);

    return success(res, { tasks, total });
  } catch (err) {
    logger.error(`getTasks: ${err.message}`);
    throw err;
  }
};

const getTask = async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
      .populate(TASK_POPULATE)
      .populate('comments.userId', 'name phone avatar')
      .lean();
    if (!task) return notFound(res, 'Task not found');
    return success(res, { task });
  } catch (err) {
    logger.error(`getTask: ${err.message}`);
    throw err;
  }
};

const updateTask = async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate(TASK_POPULATE);
    if (!task) return notFound(res, 'Task not found');

    emitToProject(task.projectId.toString(), 'task:updated', { task });

    await log({ userId: req.user._id, organizationId: req.user.organizationId, action: 'TASK_UPDATED', entity: 'Task', entityId: task._id });

    return success(res, { task }, 'Task updated');
  } catch (err) {
    logger.error(`updateTask: ${err.message}`);
    throw err;
  }
};

const updateTaskStatus = async (req, res) => {
  const { status } = req.body;
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      { $set: { status } },
      { new: true }
    ).populate(TASK_POPULATE);
    if (!task) return notFound(res, 'Task not found');

    if (status === 'DONE') {
      await Project.findByIdAndUpdate(task.projectId, { $inc: { completedTaskCount: 1 } });
    }

    emitToProject(task.projectId.toString(), 'task:status_changed', { taskId: task._id, status, task });
    emitToOrg(req.user.organizationId.toString(), 'task:status_changed', { taskId: task._id, status, task });
    emitToOrg(req.user.organizationId.toString(), 'dashboard:stats_updated', {});

    // WhatsApp notification to assignee when someone else changes the status
    if (task.assigneeId && task.assigneeId._id.toString() !== req.user._id.toString()) {
      const assigneePhone = task.assigneeId.phone;
      const assigneeName  = task.assigneeId.name;
      if (assigneePhone) {
        sendTaskStatusUpdate(assigneePhone, assigneeName, task.title, status)
          .catch(err => logger.error(`WA status update: ${err.message}`));
      }
    }

    await log({ userId: req.user._id, organizationId: req.user.organizationId, action: 'TASK_STATUS_CHANGED', entity: 'Task', entityId: task._id, meta: { status } });

    return success(res, { task }, 'Status updated');
  } catch (err) {
    logger.error(`updateTaskStatus: ${err.message}`);
    throw err;
  }
};

const deleteTask = async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!task) return notFound(res, 'Task not found');
    await Project.findByIdAndUpdate(task.projectId, { $inc: { taskCount: -1 } });
    emitToProject(task.projectId.toString(), 'task:deleted', { taskId: req.params.id });
    emitToOrg(task.organizationId.toString(), 'dashboard:stats_updated', {});
    return success(res, {}, 'Task deleted');
  } catch (err) {
    logger.error(`deleteTask: ${err.message}`);
    throw err;
  }
};

const addComment = async (req, res) => {
  const { text } = req.body;
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      { $push: { comments: { userId: req.user._id, text } } },
      { new: true }
    ).populate('comments.userId', 'name phone avatar');
    if (!task) return notFound(res, 'Task not found');
    const lastComment = task.comments[task.comments.length - 1];
    emitToProject(task.projectId.toString(), 'task:comment_added', { taskId: task._id, comment: lastComment });
    return created(res, { comment: lastComment }, 'Comment added');
  } catch (err) {
    logger.error(`addComment: ${err.message}`);
    throw err;
  }
};

const getMyTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ assigneeId: req.user._id, organizationId: req.user.organizationId })
      .sort({ dueDate: 1, createdAt: -1 })
      .populate('projectId', 'title color')
      .populate(TASK_POPULATE)
      .lean();
    return success(res, { tasks, total: tasks.length });
  } catch (err) {
    logger.error(`getMyTasks: ${err.message}`);
    throw err;
  }
};

module.exports = { createTask, getTasks, getTask, updateTask, updateTaskStatus, deleteTask, addComment, getMyTasks };
