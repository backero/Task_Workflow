const Task = require('../models/Task');
const TaskDependency = require('../models/TaskDependency');
const TaskApproval = require('../models/TaskApproval');
const { TASK_STATUS, SOCKET_EVENTS } = require('../utils/constants');
const logger = require('../utils/logger');

let io;
const setSocketIO = (socketIo) => { io = socketIo; };

// ── Progress engine ────────────────────────────────────────────────────────────

/**
 * Recursively calculate progress for a task from its children.
 * Leaf tasks use their own progress field (or 100 if completed).
 */
const calculateProgress = async (taskId) => {
  const task = await Task.findById(taskId).select('status progress autoProgress parentTask');
  if (!task) return 0;

  if (task.status === TASK_STATUS.COMPLETED) return 100;
  if (task.status === TASK_STATUS.CANCELLED)  return 100;

  const children = await Task.find({
    parentTask: taskId,
    status: { $ne: TASK_STATUS.CANCELLED },
  }).select('_id status progress autoProgress');

  if (children.length === 0) return task.progress || 0;

  let total = 0;
  for (const child of children) {
    total += await calculateProgress(child._id);
  }

  return Math.round(total / children.length);
};

/**
 * Recalculate + save progress for taskId, then propagate up to all ancestors.
 */
const propagateProgress = async (taskId) => {
  const task = await Task.findById(taskId);
  if (!task) return;

  const progress = await calculateProgress(taskId);

  if (task.autoProgress !== false || task.subTasks?.length > 0) {
    task.progress = progress;

    // Refresh completion lock whenever progress changes
    const { eligible, reasons } = await checkCompletionEligibility(task._id);
    task.completionLocked = !eligible;
    task.completionLockReasons = reasons;

    await task.save();

    io?.to(`org:${task.organizationId}`).emit(SOCKET_EVENTS.TASK_UPDATED, {
      taskId: task._id,
      progress,
      completionLocked: task.completionLocked,
    });
  }

  if (task.parentTask) {
    await propagateProgress(task.parentTask);
  }
};

// ── Completion eligibility ────────────────────────────────────────────────────

const checkCompletionEligibility = async (taskId) => {
  const task = await Task.findById(taskId);
  if (!task) return { eligible: false, reasons: ['Task not found'] };

  const reasons = [];

  // Rule 1: all non-cancelled children must be completed
  const children = await Task.find({
    parentTask: taskId,
    status: { $nin: [TASK_STATUS.CANCELLED] },
  }).select('title status');

  const incomplete = children.filter(c => c.status !== TASK_STATUS.COMPLETED);
  if (incomplete.length > 0) {
    reasons.push(`${incomplete.length} subtask(s) still incomplete: ${incomplete.slice(0, 3).map(c => `"${c.title}"`).join(', ')}${incomplete.length > 3 ? '…' : ''}`);
  }

  // Rule 2: all active dependencies must be resolved
  const deps = await TaskDependency.find({ toTask: taskId, status: 'active' })
    .populate('fromTask', 'title status');
  for (const dep of deps) {
    if (dep.fromTask && dep.fromTask.status !== TASK_STATUS.COMPLETED) {
      reasons.push(`Blocked by: "${dep.fromTask.title}" (${dep.fromTask.status})`);
    }
  }

  // Rule 3: no pending approvals
  const pendingApprovals = await TaskApproval.countDocuments({ taskId, status: 'pending' });
  if (pendingApprovals > 0) {
    reasons.push(`${pendingApprovals} approval request(s) pending`);
  }

  return { eligible: reasons.length === 0, reasons };
};

// ── Ancestor reopening ────────────────────────────────────────────────────────

/**
 * When a subtask is reopened, walk up the tree and reopen any Completed / Approval-Pending parents.
 */
const reopenAncestors = async (taskId) => {
  const task = await Task.findById(taskId).select('title parentTask organizationId');
  if (!task?.parentTask) return;

  const parent = await Task.findById(task.parentTask);
  if (!parent) return;

  const terminatedStatuses = [TASK_STATUS.COMPLETED, TASK_STATUS.APPROVAL_PENDING, TASK_STATUS.UNDER_REVIEW];
  if (terminatedStatuses.includes(parent.status)) {
    parent.status = TASK_STATUS.IN_PROGRESS;
    parent.completionLocked = true;
    parent.completionLockReasons = [`Subtask "${task.title}" was reopened`];
    await parent.save();

    io?.to(`org:${parent.organizationId}`).emit(SOCKET_EVENTS.TASK_UPDATED, {
      taskId: parent._id,
      status: TASK_STATUS.IN_PROGRESS,
    });

    await reopenAncestors(parent._id);
  }
};

// ── Task tree builder ─────────────────────────────────────────────────────────

/**
 * Build full nested task tree from rootTaskId.
 */
const buildTaskTree = async (rootTaskId, depth = 0) => {
  const task = await Task.findById(rootTaskId)
    .populate('assignedTo',  'firstName lastName avatar role department')
    .populate('assignedBy',  'firstName lastName avatar')
    .populate('reportingManager', 'firstName lastName')
    .lean();
  if (!task) return null;

  const children = await Task.find({ parentTask: rootTaskId })
    .sort({ createdAt: 1 })
    .lean();

  const childTrees = await Promise.all(children.map(c => buildTaskTree(c._id, depth + 1)));

  return { ...task, depth, children: childTrees.filter(Boolean) };
};

// ── React-Flow graph builder ──────────────────────────────────────────────────

const NODE_W = 290;
const NODE_H = 170;
const H_GAP  = 50;
const V_GAP  = 90;

const getSubtreeWidth = (node) => {
  if (!node.children?.length) return NODE_W;
  return node.children.reduce((sum, c, i) =>
    sum + getSubtreeWidth(c) + (i < node.children.length - 1 ? H_GAP : 0), 0);
};

const assignPositions = (node, x, y, positions) => {
  const savedX = node.workflowData?.x;
  const savedY = node.workflowData?.y;
  positions[node._id.toString()] = {
    x: savedX != null ? savedX : x,
    y: savedY != null ? savedY : y,
  };

  if (!node.children?.length) return;

  const totalW = node.children.reduce((sum, c, i) =>
    sum + getSubtreeWidth(c) + (i < node.children.length - 1 ? H_GAP : 0), 0);
  let cx = x - totalW / 2;

  for (const child of node.children) {
    const cw = getSubtreeWidth(child);
    assignPositions(child, cx + cw / 2, y + NODE_H + V_GAP, positions);
    cx += cw + H_GAP;
  }
};

const collectTaskIds = (node) => {
  const ids = [node._id];
  if (node.children) node.children.forEach(c => ids.push(...collectTaskIds(c)));
  return ids;
};

const flattenTree = (node, nodes, edges) => {
  nodes.push({
    id: node._id.toString(),
    type: 'taskNode',
    position: node._position,
    draggable: true,
    data: {
      id: node._id,
      title: node.title,
      description: node.description,
      status: node.status,
      priority: node.priority,
      progress: node.progress || 0,
      assignedTo: node.assignedTo,
      assignedBy: node.assignedBy,
      dueDate: node.dueDate,
      department: node.department,
      completionLocked: node.completionLocked,
      completionLockReasons: node.completionLockReasons || [],
      isOverdue: node.isOverdue,
      depth: node.depth,
      childCount: node.children?.length || 0,
      autoProgress: node.autoProgress,
      estimatedHours: node.estimatedHours,
      actualHours: node.actualHours,
    },
  });

  if (node.children) {
    for (const child of node.children) {
      edges.push({
        id: `e-${node._id}-${child._id}`,
        source: node._id.toString(),
        target: child._id.toString(),
        type: 'smoothstep',
        style: { stroke: '#64748b', strokeWidth: 2 },
        markerEnd: { type: 'arrowclosed', color: '#64748b' },
        data: { edgeType: 'hierarchy' },
      });
      flattenTree(child, nodes, edges);
    }
  }
};

const injectPositions = (node, positions) => {
  node._position = positions[node._id.toString()] || { x: 0, y: 0 };
  if (node.children) node.children.forEach(c => injectPositions(c, positions));
};

/**
 * Build React-Flow { nodes, edges } from a root task id.
 */
const buildWorkflowGraph = async (rootTaskId) => {
  const tree = await buildTaskTree(rootTaskId);
  if (!tree) return { nodes: [], edges: [] };

  const allTaskIds = collectTaskIds(tree);

  // Auto-layout
  const positions = {};
  assignPositions(tree, 0, 0, positions);
  injectPositions(tree, positions);

  const nodes = [];
  const edges = [];
  flattenTree(tree, nodes, edges);

  // Dependency edges (dashed / amber)
  const deps = await TaskDependency.find({
    fromTask: { $in: allTaskIds },
    toTask:   { $in: allTaskIds },
    status:   'active',
  });

  for (const dep of deps) {
    const fromId = dep.fromTask.toString();
    const toId   = dep.toTask.toString();

    // Avoid duplicating an edge that already exists as a hierarchy edge
    const alreadyExists = edges.some(e => e.source === fromId && e.target === toId && e.data?.edgeType === 'hierarchy');
    if (alreadyExists) continue;

    edges.push({
      id: `dep-${dep._id}`,
      source: fromId,
      target: toId,
      type: 'dependencyEdge',
      animated: true,
      style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '6 3' },
      markerEnd: { type: 'arrowclosed', color: '#f59e0b' },
      data: { dependencyType: dep.type, depId: dep._id.toString(), edgeType: 'dependency' },
      label: dep.type.replace(/_/g, ' '),
      labelStyle: { fontSize: 11, fill: '#92400e' },
    });
  }

  return { nodes, edges };
};

// ── Materialized path ─────────────────────────────────────────────────────────

const buildPath = async (taskId) => {
  const task = await Task.findById(taskId).select('parentTask');
  if (!task) return taskId.toString();
  if (!task.parentTask) return taskId.toString();
  const parentPath = await buildPath(task.parentTask);
  return `${parentPath}/${taskId}`;
};

// ── Template application ──────────────────────────────────────────────────────

const applyTemplate = async (rootTaskId, templateId, managerId, orgId) => {
  const WorkflowTemplate = require('../models/WorkflowTemplate');
  const template = await WorkflowTemplate.findOne({ _id: templateId, $or: [{ organizationId: orgId }, { isPublic: true }] });
  if (!template) throw new Error('Template not found');

  const rootTask = await Task.findById(rootTaskId);
  if (!rootTask) throw new Error('Root task not found');

  const nodeIdToTaskId = {};
  const sorted = [...template.nodes].sort((a, b) => a.level - b.level);

  for (const node of sorted) {
    const parentId = node.parentNodeId ? nodeIdToTaskId[node.parentNodeId] : rootTaskId;

    const newTask = new Task({
      organizationId: orgId,
      title: node.title,
      description: node.description,
      department: rootTask.department,
      priority: node.priority || 'medium',
      status: TASK_STATUS.PENDING,
      estimatedHours: node.estimatedHours,
      assignedBy: managerId,
      parentTask: parentId,
      level: node.level + 1,
      autoProgress: true,
      workflowData: { x: node.position?.x || 0, y: node.position?.y || 0 },
      createdBy: managerId,
    });

    await newTask.save();
    nodeIdToTaskId[node.nodeId] = newTask._id;

    await Task.findByIdAndUpdate(parentId, { $push: { subTasks: newTask._id }, $set: { autoProgress: true } });
  }

  // Create dependency records from template
  for (const node of sorted) {
    for (const depNodeId of (node.dependencies || [])) {
      const fromId = nodeIdToTaskId[depNodeId];
      const toId   = nodeIdToTaskId[node.nodeId];
      if (fromId && toId) {
        await TaskDependency.create({
          organizationId: orgId,
          fromTask: fromId,
          toTask: toId,
          type: 'finish_to_start',
          createdBy: managerId,
        }).catch(() => {}); // ignore if dup
      }
    }
  }

  await WorkflowTemplate.findByIdAndUpdate(templateId, { $inc: { usageCount: 1 } });

  return nodeIdToTaskId;
};

module.exports = {
  setSocketIO,
  calculateProgress,
  propagateProgress,
  checkCompletionEligibility,
  reopenAncestors,
  buildTaskTree,
  buildWorkflowGraph,
  buildPath,
  applyTemplate,
};
