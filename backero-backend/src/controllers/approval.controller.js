const TaskApproval = require('../models/TaskApproval');
const Task = require('../models/Task');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { TASK_STATUS, APPROVAL_STATUS, SOCKET_EVENTS, ROLE_HIERARCHY } = require('../utils/constants');
const { createNotification } = require('../services/notification.service');

// GET /api/approvals - Get approval queue
exports.getApprovals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, department } = req.query;
  const { skip } = paginate(page, limit);

  const filter = { organizationId: req.user.organizationId };
  if (status) filter.status = status;
  else filter.status = APPROVAL_STATUS.PENDING;

  const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
  if (userLevel < ROLE_HIERARCHY['manager']) {
    // Members see only their own requests
    filter.requestedBy = req.user._id;
  } else if (userLevel < ROLE_HIERARCHY['admin']) {
    // Managers see: tasks they assigned + all tasks from members in their department
    const [assignedTaskIds, deptMemberIds] = await Promise.all([
      Task.find({ organizationId: req.user.organizationId, assignedBy: req.user._id }).distinct('_id'),
      User.find({ organizationId: req.user.organizationId, department: req.user.department }).distinct('_id'),
    ]);
    filter.$or = [
      { taskId: { $in: assignedTaskIds } },
      { requestedBy: { $in: deptMemberIds } },
    ];
  }
  // Admin+ see all

  const [approvals, total] = await Promise.all([
    TaskApproval.find(filter)
      .populate({
        path: 'taskId',
        select: 'title description department priority dueDate status progress proofOfWork assignedBy',
        populate: { path: 'assignedBy', select: 'firstName lastName role' },
      })
      .populate('requestedBy', 'firstName lastName avatar department role')
      .populate('reviewedBy', 'firstName lastName avatar')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    TaskApproval.countDocuments(filter),
  ]);

  sendSuccess(res, paginateResponse(approvals, total, page, limit));
});

// Helper: check if current user is allowed to review this approval
const checkApprovalAuthority = async (req, approval) => {
  const approverLevel = ROLE_HIERARCHY[req.user.role] || 0;
  const adminLevel = ROLE_HIERARCHY['admin'];
  const managerLevel = ROLE_HIERARCHY['manager'];

  const task = await Task.findById(approval.taskId);
  if (!task) return { task: null, error: 'Task not found.' };

  const requester = await User.findById(approval.requestedBy).select('role department');
  const requesterLevel = ROLE_HIERARCHY[requester?.role] || 0;

  const isAssigner = String(task.assignedBy) === String(req.user._id);
  const isReportingManager = task.reportingManager && String(task.reportingManager) === String(req.user._id);
  const isSameDeptManager = approverLevel >= managerLevel && req.user.department &&
    (req.user.department === requester?.department || req.user.department === task.department);

  if (requesterLevel >= managerLevel) {
    // Manager submitted → assigning manager or admin+ can approve
    if (!isAssigner && approverLevel < adminLevel) {
      return { task, error: 'Only the assigning manager or an admin can approve tasks submitted by managers.' };
    }
  } else {
    // Member/team_lead submitted → assigning manager, reporting manager, same-dept manager, or admin can approve
    if (!isAssigner && !isReportingManager && !isSameDeptManager && approverLevel < adminLevel) {
      return { task, error: 'Only the assigned manager, a department manager, or an admin can approve this task.' };
    }
  }

  return { task, error: null };
};

// POST /api/approvals/:id/approve
exports.approveTask = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { reviewNotes } = req.body;

  const approval = await TaskApproval.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!approval) return sendError(res, 'Approval request not found.', 404);
  if (approval.status !== APPROVAL_STATUS.PENDING) return sendError(res, 'This approval has already been reviewed.', 400);

  const { task, error } = await checkApprovalAuthority(req, approval);
  if (error) return sendError(res, error, 403);
  if (!task) return sendError(res, 'Task not found.', 404);

  approval.status = APPROVAL_STATUS.APPROVED;
  approval.reviewedBy = req.user._id;
  approval.reviewNotes = reviewNotes;
  approval.reviewedAt = new Date();
  approval.updatedBy = req.user._id;
  await approval.save();

  task.status = TASK_STATUS.COMPLETED;
  task.completedAt = new Date();
  task.activity.push({ action: 'Task approved and completed', performedBy: req.user._id, details: { reviewNotes } });
  task.updatedBy = req.user._id;
  await task.save();

  // WhatsApp to client if this task is linked to a lead
  if (task.relatedTo?.model === 'Lead' && task.relatedTo?.id) {
    const Lead = require('../models/Lead');
    const { sendMessage } = require('../services/whatsapp.service');
    Lead.findById(task.relatedTo.id).select('name phone whatsapp').then((lead) => {
      if (!lead) return;
      const phone = lead.whatsapp || lead.phone;
      if (!phone) return;
      const msg =
        `*✅ Order Complete — Backero*\n\n` +
        `Hi ${lead.name},\n\n` +
        `Great news! Your order *"${task.title}"* has been completed successfully.\n\n` +
        `Thank you for choosing Backero. Please reach out if you need anything further.\n\n` +
        `_— Backero Team_`;
      sendMessage(phone, msg).catch(() => {});
    }).catch(() => {});
  }

  await createNotification({
    organizationId: req.user.organizationId,
    recipient: approval.requestedBy,
    title: 'Task Approved!',
    message: `Your task "${task.title}" has been approved by ${req.user.firstName} ${req.user.lastName}`,
    type: 'approval',
    priority: 'high',
    actionUrl: `/tasks/${task._id}`,
    reference: { model: 'Task', id: task._id },
    channels: { inApp: true, whatsapp: true },
  }, io);

  io?.to(`org:${req.user.organizationId}`).emit(SOCKET_EVENTS.TASK_APPROVED, { taskId: task._id, approvalId: approval._id });
  io?.to(`user:${approval.requestedBy}`).emit(SOCKET_EVENTS.TASK_APPROVED, { taskId: task._id });

  await ActivityLog.create({
    organizationId: req.user.organizationId,
    performedBy: req.user._id,
    action: 'task_approved',
    module: 'task',
    reference: { model: 'Task', id: task._id, title: task.title },
  });

  sendSuccess(res, { approval, task }, 'Task approved and marked as completed');
});

// POST /api/approvals/:id/reject
exports.rejectTask = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { reviewNotes } = req.body;

  if (!reviewNotes?.trim()) return sendError(res, 'Rejection reason is required.', 400);

  const approval = await TaskApproval.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!approval) return sendError(res, 'Approval request not found.', 404);
  if (approval.status !== APPROVAL_STATUS.PENDING) return sendError(res, 'This approval has already been reviewed.', 400);

  const { task, error } = await checkApprovalAuthority(req, approval);
  if (error) return sendError(res, error, 403);
  if (!task) return sendError(res, 'Task not found.', 404);

  approval.status = APPROVAL_STATUS.REJECTED;
  approval.reviewedBy = req.user._id;
  approval.reviewNotes = reviewNotes;
  approval.reviewedAt = new Date();
  await approval.save();

  task.status = TASK_STATUS.CHANGES_REQUESTED;
  task.rejectionCount = (task.rejectionCount || 0) + 1;
  task.activity.push({ action: 'Task rejected - changes requested', performedBy: req.user._id, details: { reviewNotes } });
  task.updatedBy = req.user._id;
  await task.save();

  await createNotification({
    organizationId: req.user.organizationId,
    recipient: approval.requestedBy,
    title: 'Task Requires Changes',
    message: `Your task "${task.title}" was returned with feedback: ${reviewNotes}`,
    type: 'approval',
    priority: 'high',
    actionUrl: `/tasks/${task._id}`,
    reference: { model: 'Task', id: task._id },
    channels: { inApp: true, whatsapp: true },
  }, io);

  io?.to(`user:${approval.requestedBy}`).emit(SOCKET_EVENTS.TASK_REJECTED, { taskId: task._id, reason: reviewNotes });

  sendSuccess(res, { approval, task }, 'Task rejected with feedback');
});

// POST /api/approvals/:id/request-changes
exports.requestChanges = asyncHandler(async (req, res) => {
  const { reviewNotes } = req.body;
  if (!reviewNotes?.trim()) return sendError(res, 'Change description is required.', 400);

  const approval = await TaskApproval.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!approval) return sendError(res, 'Approval not found.', 404);

  const { task, error } = await checkApprovalAuthority(req, approval);
  if (error) return sendError(res, error, 403);
  if (!task) return sendError(res, 'Task not found.', 404);

  approval.status = APPROVAL_STATUS.CHANGES_REQUESTED;
  approval.reviewedBy = req.user._id;
  approval.reviewNotes = reviewNotes;
  approval.reviewedAt = new Date();
  await approval.save();

  task.status = TASK_STATUS.CHANGES_REQUESTED;
  task.activity.push({ action: 'Changes requested', performedBy: req.user._id, details: { reviewNotes } });
  await task.save();

  sendSuccess(res, { approval }, 'Changes requested');
});

// GET /api/approvals/stats
exports.getApprovalStats = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;

  const [pending, approved, rejected, myRequests] = await Promise.all([
    TaskApproval.countDocuments({ organizationId: orgId, status: 'pending' }),
    TaskApproval.countDocuments({ organizationId: orgId, status: 'approved' }),
    TaskApproval.countDocuments({ organizationId: orgId, status: 'rejected' }),
    TaskApproval.countDocuments({ organizationId: orgId, requestedBy: req.user._id }),
  ]);

  sendSuccess(res, { stats: { pending, approved, rejected, myRequests } });
});
