// Payroll endpoints — ported from the Attendance Tracker's
// app/modules/payroll/router.py. payroll:read covers periods/records;
// payroll:manage_config covers period creation, record generation, and
// per-employee salary config; payroll:finalize covers finalizing a period
// and approving a correction — all gated at the route level (see
// routes/payroll.routes.js), matching the source's permission tiers.
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Organization = require('../models/Organization');
const { asyncHandler, sendSuccess, sendError, paginateResponse } = require('../utils/helpers');
const payrollService = require('../services/payroll.service');
const { importPaidSalaries } = require('../services/payrollImport.service');
const { generatePayslipPDF } = require('../services/payslipPdf.service');
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

exports.reopenPeriod = asyncHandler(async (req, res) => {
  const period = await payrollService.reopenPeriod(req.user.organizationId, req.user._id, req.params.periodId);
  sendSuccess(res, { period }, 'Payroll period reopened');
});

exports.importPaidSalaries = asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, 'An Excel file is required.', 422);
  const results = await importPaidSalaries(req.user.organizationId, req.user._id, req.params.periodId, req.file.buffer);
  sendSuccess(res, results, `Imported ${results.imported} record(s)${results.skipped.length ? `, skipped ${results.skipped.length}` : ''}`);
});

exports.getPeriodRecords = asyncHandler(async (req, res) => {
  const rows = await payrollService.listRecordsForPeriod(req.user.organizationId, req.params.periodId);
  const shaped = rows.map(({ record: r, pendingCorrection }) => ({
    ...r.toObject(),
    employeeCode: r.employeeId?.employeeCode,
    employeeFullName: r.employeeId?.fullName,
    employeeId: r.employeeId?._id,
    pendingCorrection,
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

exports.rejectCorrection = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || reason.trim().length < 5) return sendError(res, 'reason must be at least 5 characters.', 422);
  const correction = await payrollService.rejectCorrection(
    req.user.organizationId, req.user._id, req.params.recordId, req.params.correctionId, reason.trim(),
  );
  sendSuccess(res, { correction }, 'Correction rejected.');
});

// Same ownership-or-permission gate as getEmployeePayrollRecords — an
// employee can always download their own payslip; anyone else needs
// payroll:read (or admin+).
exports.downloadSlip = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const record = await payrollService.getRecordOr404(orgId, req.params.recordId);
  const employee = await Employee.findOne({ _id: record.employeeId, organizationId: orgId });
  if (!employee) return sendError(res, 'Payroll record not found.', 404);

  const myEmployee = await Employee.findOne({ organizationId: orgId, userId: req.user._id, deletedAt: null });
  const isOwnRecord = myEmployee && String(myEmployee._id) === String(employee._id);
  if (!isOwnRecord) {
    const level = ROLE_HIERARCHY[req.user.role] || 0;
    const allowed = level >= ROLE_HIERARCHY['admin'] || (req.user.permissions || []).includes(ATTENDANCE_PERMISSIONS.PAYROLL_READ);
    if (!allowed) return sendError(res, 'Payroll record not found.', 404);
  }

  const period = await payrollService.getPeriodOr404(orgId, record.payrollPeriodId);
  const [department, designation, organization] = await Promise.all([
    Department.findById(employee.departmentId).lean(),
    Designation.findById(employee.designationId).lean(),
    Organization.findById(orgId).lean(),
  ]);

  const pdfBuffer = await generatePayslipPDF({
    organization: organization || {}, employee: employee.toObject(), department, designation,
    period: period.toObject(), record: record.toObject(),
  });

  const fileName = `Payslip-${employee.employeeCode}-${period.periodStart.toISOString().slice(0, 10)}.pdf`;
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"` });
  res.send(pdfBuffer);
});
