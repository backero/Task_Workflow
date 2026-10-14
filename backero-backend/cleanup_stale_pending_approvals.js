// One-time cleanup: resolves orphaned TaskApproval records stuck on status:'pending'
// whose task has already moved past the approval step (Completed/Achieved/Reopened/
// Changes Requested/Cancelled) or which are superseded by a later round for the same
// task. These orphans were left behind by the approvalId-mismatch bug in
// completeTask/rejectTask/reopenTask (see workflow.controller.js) and permanently
// block checkCompletionEligibility's "no pending approvals" rule.
//
// Usage: node cleanup_stale_pending_approvals.js [--dry-run]

require('dotenv').config();
const mongoose = require('mongoose');
const TaskApproval = require('./src/models/TaskApproval');
const Task = require('./src/models/Task');

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const pending = await TaskApproval.find({ status: 'pending' }).sort({ taskId: 1, round: -1 });
  console.log(`Found ${pending.length} pending approval record(s).`);

  const byTask = new Map();
  for (const approval of pending) {
    const key = approval.taskId.toString();
    if (!byTask.has(key)) byTask.set(key, []);
    byTask.get(key).push(approval);
  }

  let resolvedCount = 0;

  for (const [taskId, approvals] of byTask) {
    const task = await Task.findById(taskId).select('status title');

    if (!task) {
      // Task itself is gone — nothing to reconcile against, resolve all as stale.
      for (const approval of approvals) {
        console.log(`[orphan-task] approval ${approval._id} → task ${taskId} no longer exists`);
        if (!DRY_RUN) {
          approval.status = 'changes_requested';
          approval.reviewNotes = 'Resolved by cleanup script: task no longer exists';
          approval.reviewedAt = new Date();
          await approval.save();
        }
        resolvedCount++;
      }
      continue;
    }

    if (task.status === 'Approval Pending') {
      // Legit: the latest round (already sorted first) stays pending; any older
      // rounds are stale duplicates left behind by a previous bug-triggered path.
      const [, ...stale] = approvals;
      for (const approval of stale) {
        console.log(`[stale-round] approval ${approval._id} round ${approval.round} on task "${task.title}" (${taskId}) — superseded`);
        if (!DRY_RUN) {
          approval.status = 'changes_requested';
          approval.reviewNotes = 'Resolved by cleanup script: superseded by a later round';
          approval.reviewedAt = new Date();
          await approval.save();
        }
        resolvedCount++;
      }
    } else {
      // Task has moved on (Completed, Achieved, Reopened, Changes Requested, Cancelled,
      // In Progress, etc.) — every pending approval here is orphaned.
      const resolveAs = ['Completed', 'Achieved'].includes(task.status) ? 'approved' : 'changes_requested';
      for (const approval of approvals) {
        console.log(`[orphan] approval ${approval._id} on task "${task.title}" (${taskId}, status=${task.status}) → ${resolveAs}`);
        if (!DRY_RUN) {
          approval.status = resolveAs;
          approval.reviewNotes = `Resolved by cleanup script: task status is "${task.status}"`;
          approval.reviewedAt = new Date();
          await approval.save();
        }
        resolvedCount++;
      }
    }
  }

  console.log(DRY_RUN
    ? `Dry run complete. Would resolve ${resolvedCount} stale approval(s).`
    : `Done. Resolved ${resolvedCount} stale approval(s).`);

  await mongoose.disconnect();
})();
