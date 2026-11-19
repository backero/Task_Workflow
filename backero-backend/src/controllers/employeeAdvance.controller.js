const Employee = require('../models/Employee');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const { recordAuditEvent } = require('../services/attendanceAudit.service');

async function myEmployee(req) {
  return Employee.findOne({ organizationId: req.user.organizationId, userId: req.user._id, deletedAt: null });
}

exports.request = asyncHandler(async (req, res) => {
  const employee = await myEmployee(req);
  if (!employee) return sendError(res, 'No employee profile is linked to your account yet.', 404);
  const amount = Number(req.body.amount);
  const reason = String(req.body.reason || '').trim();
  if (!Number.isFinite(amount) || amount <= 0) return sendError(res, 'A positive advance amount is required.', 422);
  if (reason.length < 3) return sendError(res, 'Please provide a reason of at least 3 characters.', 422);
  const advance = await EmployeeAdvance.create({ organizationId: req.user.organizationId, employeeId: employee._id, requestedAmount: amount, reason, requestedBy: req.user._id });
  await recordAuditEvent({ organizationId: req.user.organizationId, actorUserId: req.user._id, action: 'employee_advance.request', entityType: 'EmployeeAdvance', entityId: advance._id, newValue: { amount, reason } });
  sendSuccess(res, { advance }, 'Advance request submitted for approval.', 201);
});

exports.myRequests = asyncHandler(async (req, res) => {
  const employee = await myEmployee(req);
  if (!employee) return sendError(res, 'No employee profile is linked to your account yet.', 404);
  const advances = await EmployeeAdvance.find({ organizationId: req.user.organizationId, employeeId: employee._id }).sort({ createdAt: -1 });
  sendSuccess(res, { advances });
});

exports.list = asyncHandler(async (req, res) => {
  const query = { organizationId: req.user.organizationId };
  if (req.query.status) query.status = req.query.status;
  const advances = await EmployeeAdvance.find(query).populate('employeeId', 'fullName employeeCode').sort({ createdAt: -1 });
  sendSuccess(res, { advances });
});

exports.decide = asyncHandler(async (req, res) => {
  const advance = await EmployeeAdvance.findOne({ _id: req.params.advanceId, organizationId: req.user.organizationId });
  if (!advance) return sendError(res, 'Advance request not found.', 404);
  if (advance.status !== 'PENDING') return sendError(res, 'This advance request has already been decided.', 409);
  const decision = String(req.body.decision || '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(decision)) return sendError(res, 'decision must be APPROVED or REJECTED.', 422);
  if (String(advance.requestedBy) === String(req.user._id)) return sendError(res, 'A request must be approved by a different administrator.', 403);
  if (decision === 'APPROVED') {
    const approvedAmount = Number(req.body.approved_amount ?? advance.requestedAmount);
    const installment = Number(req.body.monthly_installment);
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) return sendError(res, 'A positive approved amount is required.', 422);
    if (!Number.isFinite(installment) || installment <= 0 || installment > approvedAmount) return sendError(res, 'Monthly installment must be greater than zero and cannot exceed approved amount.', 422);
    advance.approvedAmount = approvedAmount;
    advance.monthlyInstallment = installment;
    advance.remainingBalance = approvedAmount;
  }
  advance.status = decision;
  advance.decidedBy = req.user._id;
  advance.decidedAt = new Date();
  advance.decisionNote = String(req.body.note || '').trim() || null;
  await advance.save();
  await recordAuditEvent({ organizationId: req.user.organizationId, actorUserId: req.user._id, action: `employee_advance.${decision.toLowerCase()}`, entityType: 'EmployeeAdvance', entityId: advance._id, newValue: { approvedAmount: advance.approvedAmount, monthlyInstallment: advance.monthlyInstallment } });
  sendSuccess(res, { advance }, `Advance request ${decision.toLowerCase()}.`);
});
