// Payroll endpoints — ported from the Attendance Tracker's
// app/modules/payroll/router.py. payroll:read covers periods/records;
// payroll:manage_config covers period creation, record generation, and
// per-employee salary config; payroll:finalize covers finalizing a period
// and approving a correction — all gated at the route level (see
// routes/payroll.routes.js), matching the source's permission tiers.
const Employee = require('../models/Employee');
const { asyncHandler, sendSuccess, sendError, paginateResponse } = require('../utils/helpers');
const payrollService = require('../services/payroll.service');
const { ROLE_HIERARCHY } = require('../utils/constants');
const { ATTENDANCE_PERMISSIONS } = require('../utils/attendanceConstants');

exports.createPeriod = asyncHandler(async (req, res) => {
  const { period_start: periodStart, period_end: periodEnd } = req.body;
  if (!periodStart || !periodEnd) return sendError(res, 'period_start and period_end are required.', 422);
  const period = await payrollService.createPeriod(req.user.organizationId, req.user._id, {
    periodStart: new Date(periodStart), periodEnd: new Date(periodEnd),
  });
  sendSuccess(res, { period }, 'Payroll period created', 201);
});

exports.listPeriods = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { items, total } = await payrollService.listPeriods(req.user.organizationId, { page: Number(page), limit: Number(limit) });
  sendSuccess(res, paginateResponse(items, total, page, limit));
});

exports.generateRecords = asyncHandler(async (req, res) => {
  const { generatedCount, skippedEmployeeIds } = await payrollService.generateRecords(
    req.user.organizationId, req.user._id, req.params.periodId,
  );
  sendSuccess(res, { generated_count: generatedCount, skipped_employee_ids: skippedEmployeeIds });
});

exports.finalizePeriod = asyncHandler(async (req, res) => {
  const period = await payrollService.finalizePeriod(req.user.organizationId, req.user._id, req.params.periodId);
  sendSuccess(res, { period }, 'Payroll period finalized');
});

exports.getPeriodRecords = asyncHandler(async (req, res) => {
  const records = await payrollService.listRecordsForPeriod(req.user.organizationId, req.params.periodId);
  const shaped = records.map((r) => ({
    ...r.toObject(),
    employeeCode: r.employeeId?.employeeCode,
    employeeFullName: r.employeeId?.fullName,
    employeeId: r.employeeId?._id,
  }));
  sendSuccess(res, { records: shaped });
});

exports.getMyPayrollRecords = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ organizationId: req.user.organizationId, userId: req.user._id, deletedAt: null });
  if (!employee) return sendError(res, 'No employee profile is linked to your account yet.', 404);
  const records = await payrollService.listRecordsForEmployee(req.user.organizationId, employee._id);
  sendSuccess(res, { records });
});

exports.getEmployeePayrollRecords = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const employee = await Employee.findOne({ organizationId: orgId, userId: req.user._id, deletedAt: null });
  const isOwnRecord = employee && String(employee._id) === String(req.params.employeeId);
  if (!isOwnRecord) {
    const level = ROLE_HIERARCHY[req.user.role] || 0;
    const allowed = level >= ROLE_HIERARCHY['admin'] || (req.user.permissions || []).includes(ATTENDANCE_PERMISSIONS.PAYROLL_READ);
    if (!allowed) return sendError(res, 'Employee not found.', 404);
  }
  const records = await payrollService.listRecordsForEmployee(orgId, req.params.employeeId);
  sendSuccess(res, { records });
});

exports.getPayrollConfig = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ _id: req.params.employeeId, organizationId: req.user.organizationId, deletedAt: null });
  if (!employee) return sendError(res, 'Employee not found.', 404);
  sendSuccess(res, { employee_id: employee._id, basic_monthly_salary: employee.basicMonthlySalary });
});

exports.setPayrollConfig = asyncHandler(async (req, res) => {
  const { basic_monthly_salary: basicMonthlySalary } = req.body;
  if (basicMonthlySalary == null) return sendError(res, 'basic_monthly_salary is required.', 422);
  const employee = await payrollService.setPayrollConfig(
    req.user.organizationId, req.user._id, req.params.employeeId, Number(basicMonthlySalary),
  );
  sendSuccess(res, { employee_id: employee._id, basic_monthly_salary: employee.basicMonthlySalary });
});

exports.requestCorrection = asyncHandler(async (req, res) => {
  const { reason, proposed_basic_earnings: proposedBasicEarnings, proposed_deductions: proposedDeductions } = req.body;
  if (!reason || reason.trim().length < 5) return sendError(res, 'reason must be at least 5 characters.', 422);
  if (proposedBasicEarnings == null || proposedDeductions == null) {
    return sendError(res, 'proposed_basic_earnings and proposed_deductions are required.', 422);
  }
  const correction = await payrollService.requestCorrection(req.user.organizationId, req.user._id, req.params.recordId, {
    reason, proposedBasicEarnings: Number(proposedBasicEarnings), proposedDeductions: Number(proposedDeductions),
  });
  sendSuccess(res, { correction }, 'Correction request submitted for approval.');
});

exports.approveCorrection = asyncHandler(async (req, res) => {
  const record = await payrollService.approveCorrection(
    req.user.organizationId, req.user._id, req.params.recordId, req.params.correctionId,
  );
  sendSuccess(res, { record }, 'Correction approved.');
});
