const { asyncHandler, sendSuccess } = require('../utils/helpers');
const leaveService = require('../services/leave.service');

// --- Types ---
exports.listTypes = asyncHandler(async (req, res) => {
  const types = await leaveService.listTypes(req.user.organizationId);
  sendSuccess(res, { types });
});

exports.createType = asyncHandler(async (req, res) => {
  const { name, code, is_paid: isPaid } = req.body;
  const type = await leaveService.createType(req.user.organizationId, req.user._id, { name, code, isPaid });
  sendSuccess(res, { type }, 'Leave type created', 201);
});

// --- Balances ---
exports.getMyBalances = asyncHandler(async (req, res) => {
  const employee = await leaveService.resolveEmployeeForUser(req.user.organizationId, req.user._id);
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  const balances = await leaveService.listBalances(req.user.organizationId, employee._id, year);
  sendSuccess(res, { balances });
});

exports.getEmployeeBalances = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  const balances = await leaveService.listBalances(req.user.organizationId, req.params.employeeId, year);
  sendSuccess(res, { balances });
});

exports.setBalance = asyncHandler(async (req, res) => {
  const { employee_id: employeeId, leave_type_id: leaveTypeId, year, total_days: totalDays } = req.body;
  const balance = await leaveService.setBalance(req.user.organizationId, req.user._id, {
    employeeId, leaveTypeId, year: Number(year), totalDays: Number(totalDays),
  });
  sendSuccess(res, { balance }, 'Balance updated');
});

// --- Requests ---
exports.getMyRequests = asyncHandler(async (req, res) => {
  const employee = await leaveService.resolveEmployeeForUser(req.user.organizationId, req.user._id);
  const requests = await leaveService.listMyRequests(req.user.organizationId, employee._id);
  sendSuccess(res, { requests });
});

exports.listRequests = asyncHandler(async (req, res) => {
  const { status, employee_id: employeeId } = req.query;
  const requests = await leaveService.listRequests(req.user.organizationId, { status, employeeId });
  sendSuccess(res, { requests });
});

exports.apply = asyncHandler(async (req, res) => {
  const { leave_type_id: leaveTypeId, start_date: startDate, end_date: endDate, reason } = req.body;
  const request = await leaveService.applyForLeave(req.user.organizationId, req.user._id, { leaveTypeId, startDate, endDate, reason });
  sendSuccess(res, { request }, 'Leave request submitted', 201);
});

exports.cancel = asyncHandler(async (req, res) => {
  const request = await leaveService.cancelRequest(req.user.organizationId, req.user._id, req.params.id);
  sendSuccess(res, { request }, 'Leave request cancelled');
});

exports.approve = asyncHandler(async (req, res) => {
  const request = await leaveService.decideRequest(req.user.organizationId, req.user._id, req.params.id, 'APPROVED', req.body?.note);
  sendSuccess(res, { request }, 'Leave request approved');
});

exports.reject = asyncHandler(async (req, res) => {
  const request = await leaveService.decideRequest(req.user.organizationId, req.user._id, req.params.id, 'REJECTED', req.body?.note);
  sendSuccess(res, { request }, 'Leave request rejected');
});
