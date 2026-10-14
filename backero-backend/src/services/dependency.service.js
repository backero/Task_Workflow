const TaskDependency = require('../models/TaskDependency');
const Task = require('../models/Task');

/**
 * Add a dependency: fromTask must finish before toTask can be completed.
 * Performs circular-dependency detection before creating.
 */
const addDependency = async (fromTaskId, toTaskId, type = 'finish_to_start', orgId, userId) => {
  if (fromTaskId.toString() === toTaskId.toString()) {
    throw new Error('A task cannot depend on itself');
  }

  const existing = await TaskDependency.findOne({
    fromTask: fromTaskId,
    toTask: toTaskId,
    status: { $ne: 'waived' },
  });
  if (existing) throw new Error('Dependency already exists');

  // Cycle guard: would creating from→to introduce a cycle?
  const hasCycle = await detectCycle(toTaskId, fromTaskId, orgId);
  if (hasCycle) throw new Error('Adding this dependency would create a circular dependency');

  const dep = await TaskDependency.create({
    organizationId: orgId,
    fromTask: fromTaskId,
    toTask: toTaskId,
    type,
    createdBy: userId,
  });

  // Lock toTask if fromTask is not yet completed
  const fromTask = await Task.findById(fromTaskId).select('title status');
  if (fromTask && fromTask.status !== 'Completed') {
    await Task.findByIdAndUpdate(toTaskId, {
      completionLocked: true,
      $addToSet: { completionLockReasons: `Blocked by: "${fromTask.title}"` },
    });
  }

  return dep;
};

/**
 * Iterative DFS: detect if there is a path from startId back to targetId
 * following existing active dependencies (toTask → fromTask direction).
 */
const detectCycle = async (startId, targetId, orgId) => {
  const visited = new Set();
  const stack   = [startId.toString()];

  while (stack.length) {
    const current = stack.pop();
    if (current === targetId.toString()) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = await TaskDependency.find({
      toTask: current,
      organizationId: orgId,
      status: 'active',
    }).select('fromTask');

    for (const d of deps) stack.push(d.fromTask.toString());
  }

  return false;
};

/**
 * Waive / remove a dependency.
 */
const removeDependency = async (depId, userId) => {
  const dep = await TaskDependency.findByIdAndUpdate(depId, {
    status: 'waived',
    resolvedAt: new Date(),
    resolvedBy: userId,
  }, { new: true });

  if (!dep) throw new Error('Dependency not found');

  // Re-evaluate toTask's lock
  const { checkCompletionEligibility } = require('./workflowEngine.service');
  const toTask = await Task.findById(dep.toTask);
  if (toTask) {
    const { eligible, reasons } = await checkCompletionEligibility(dep.toTask);
    toTask.completionLocked = !eligible;
    toTask.completionLockReasons = reasons;
    await toTask.save();
  }

  return dep;
};

/**
 * When a task is completed, resolve all its finish-to-start outgoing dependencies
 * and unlock tasks that were blocked by it.
 */
const resolveOutgoingDependencies = async (taskId, orgId) => {
  await TaskDependency.updateMany(
    { fromTask: taskId, organizationId: orgId, status: 'active', type: 'finish_to_start' },
    { status: 'resolved', resolvedAt: new Date() }
  );

  const downstream = await TaskDependency.find({ fromTask: taskId, organizationId: orgId }).select('toTask');
  const { checkCompletionEligibility } = require('./workflowEngine.service');

  for (const d of downstream) {
    const { eligible, reasons } = await checkCompletionEligibility(d.toTask);
    await Task.findByIdAndUpdate(d.toTask, {
      completionLocked: !eligible,
      completionLockReasons: reasons,
    });
  }
};

/**
 * Topological sort using Kahn's algorithm.
 * Throws if a cycle is detected.
 */
const topologicalSort = async (taskIds, orgId) => {
  const ids = taskIds.map(String);
  const inDegree = Object.fromEntries(ids.map(id => [id, 0]));
  const adj      = Object.fromEntries(ids.map(id => [id, []]));

  const deps = await TaskDependency.find({
    fromTask: { $in: taskIds },
    toTask:   { $in: taskIds },
    organizationId: orgId,
    status: 'active',
  });

  for (const dep of deps) {
    const from = dep.fromTask.toString();
    const to   = dep.toTask.toString();
    if (adj[from]) {
      adj[from].push(to);
      inDegree[to] = (inDegree[to] || 0) + 1;
    }
  }

  const queue  = ids.filter(id => inDegree[id] === 0);
  const result = [];

  while (queue.length) {
    const cur = queue.shift();
    result.push(cur);
    for (const nb of (adj[cur] || [])) {
      inDegree[nb]--;
      if (inDegree[nb] === 0) queue.push(nb);
    }
  }

  if (result.length !== ids.length) throw new Error('Circular dependency detected');
  return result;
};

module.exports = {
  addDependency,
  detectCycle,
  removeDependency,
  resolveOutgoingDependencies,
  topologicalSort,
};
