// Payroll foundation — ported from the Attendance Tracker's
// app/modules/payroll/service.py. Basic earnings/deductions only —
// deliberately NO statutory rules (tax, PF, ESI); see computeEarnings for
// the exact, explicitly-documented assumption this makes.
const PayrollPeriod = require('../models/PayrollPeriod');
const PayrollRecord = require('../models/PayrollRecord');
const PayrollRecordCorrection = require('../models/PayrollRecordCorrection');
const Employee = require('../models/Employee');
const { getAttendanceSummary } = require('./attendanceSummary.service');
const { recordAuditEvent } = require('./attendanceAudit.service');

function fail(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Assumption (no statutory rules, foundation scope): basicEarnings is
 * always the full configured monthly salary. deductions is a per-day rate
 * (basicMonthlySalary / totalDays in the period) applied to
 * unpaid-day-equivalents, where an absent day counts as 1 and a half day
 * counts as 0.5 — paidLeaveDays (ON_LEAVE/HOLIDAY/WEEK_OFF) are never
 * deducted. If the period has zero attendance rows at all, the whole
 * period is treated as unpaid (deductions == basicEarnings) rather than
 * dividing by zero. */
function computeEarnings(basicMonthlySalary, summary) {
  const basicEarnings = round2(basicMonthlySalary);
  if (summary.totalDays === 0) {
    return { basicEarnings, deductions: basicEarnings, netSalary: 0 };
  }
  const perDayRate = basicMonthlySalary / summary.totalDays;
  const unpaidDayEquivalents = summary.absentDays + summary.halfDays * 0.5;
  const deductions = round2(perDayRate * unpaidDayEquivalents);
  const netSalary = round2(basicEarnings - deductions);
  return { basicEarnings, deductions, netSalary };
}

async function createPeriod(organizationId, actorUserId, { periodStart, periodEnd }) {
  if (periodEnd < periodStart) throw fail(422, 'period_end must not be before period_start.');

  const overlapping = await PayrollPeriod.findOne({
    organizationId, periodStart: { $lte: periodEnd }, periodEnd: { $gte: periodStart },
  });
  if (overlapping) throw fail(409, 'A payroll period already exists overlapping this date range.');

  const period = await PayrollPeriod.create({ organizationId, periodStart, periodEnd, status: 'OPEN' });
  await recordAuditEvent({
    organizationId, actorUserId, action: 'payroll_period.create', entityType: 'PayrollPeriod', entityId: period._id,
    newValue: { periodStart, periodEnd },
  });
  return period;
}

async function listPeriods(organizationId, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  const total = await PayrollPeriod.countDocuments({ organizationId });
  const items = await PayrollPeriod.find({ organizationId }).sort({ periodStart: -1 }).skip(skip).limit(limit);
  return { items, total, page, limit };
}

async function getPeriodOr404(organizationId, periodId) {
  const period = await PayrollPeriod.findOne({ _id: periodId, organizationId });
  if (!period) throw fail(404, 'Payroll period not found.');
  return period;
}

async function setPayrollConfig(organizationId, actorUserId, employeeId, basicMonthlySalary) {
  const employee = await Employee.findOne({ _id: employeeId, organizationId, deletedAt: null });
  if (!employee) throw fail(404, 'Employee not found.');

  const previous = employee.basicMonthlySalary;
  employee.basicMonthlySalary = basicMonthlySalary;
  await employee.save();

  await recordAuditEvent({
    organizationId, actorUserId, action: 'payroll_config.update', entityType: 'Employee', entityId: employee._id,
    previousValue: { basicMonthlySalary: previous }, newValue: { basicMonthlySalary },
  });
  return employee;
}

async function generateRecords(organizationId, actorUserId, periodId) {
  const period = await getPeriodOr404(organizationId, periodId);
  if (period.status === 'FINALIZED') {
    throw fail(409, 'This payroll period is finalized — records are immutable except via correction.');
  }

  const employees = await Employee.find({ organizationId, deletedAt: null });
  const existingRecords = await PayrollRecord.find({ organizationId, payrollPeriodId: period._id });
  const existingByEmployee = new Map(existingRecords.map((r) => [String(r.employeeId), r]));

  let generatedCount = 0;
  const skippedEmployeeIds = [];

  for (const employee of employees) {
    if (employee.basicMonthlySalary == null) {
      skippedEmployeeIds.push(employee._id);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const summary = await getAttendanceSummary(organizationId, employee._id, {
      periodStart: period.periodStart, periodEnd: period.periodEnd,
    });
    const { basicEarnings, deductions, netSalary } = computeEarnings(employee.basicMonthlySalary, summary);

    const existing = existingByEmployee.get(String(employee._id));
    if (existing) {
      existing.basicEarnings = basicEarnings;
      existing.deductions = deductions;
      existing.netSalary = netSalary;
      existing.attendanceSummarySnapshot = summary;
      // eslint-disable-next-line no-await-in-loop
      await existing.save();
    } else {
      // eslint-disable-next-line no-await-in-loop
      await PayrollRecord.create({
        organizationId,
        payrollPeriodId: period._id,
        employeeId: employee._id,
        basicEarnings,
        deductions,
        netSalary,
        attendanceSummarySnapshot: summary,
        createdAt: new Date(),
      });
    }
    generatedCount += 1;
  }

  await recordAuditEvent({
    organizationId, actorUserId, action: 'payroll_period.generate', entityType: 'PayrollPeriod', entityId: period._id,
    newValue: { generatedCount, skippedEmployeeIds },
  });
  return { generatedCount, skippedEmployeeIds };
}

async function finalizePeriod(organizationId, actorUserId, periodId) {
  const period = await getPeriodOr404(organizationId, periodId);
  if (period.status === 'FINALIZED') throw fail(409, 'This payroll period is already finalized.');

  const records = await PayrollRecord.find({ organizationId, payrollPeriodId: period._id });
  if (!records.length) {
    throw fail(422, 'No payroll records exist for this period — generate them before finalizing.');
  }

  const now = new Date();
  await PayrollRecord.updateMany(
    { organizationId, payrollPeriodId: period._id },
    { $set: { isFinalized: true, finalizedAt: now } },
  );

  period.status = 'FINALIZED';
  period.finalizedAt = now;
  period.finalizedBy = actorUserId;
  await period.save();

  await recordAuditEvent({
    organizationId, actorUserId, action: 'payroll_period.finalize', entityType: 'PayrollPeriod', entityId: period._id,
    previousValue: { status: 'OPEN' }, newValue: { status: 'FINALIZED', recordCount: records.length },
  });
  return period;
}

async function listRecordsForEmployee(organizationId, employeeId) {
  return PayrollRecord.find({ organizationId, employeeId }).sort({ createdAt: -1 });
}

/** Every record in a period, joined to its Employee for display. */
async function listRecordsForPeriod(organizationId, periodId) {
  await getPeriodOr404(organizationId, periodId);
  const records = await PayrollRecord.find({ organizationId, payrollPeriodId: periodId }).populate('employeeId', 'employeeCode fullName');
  return records
    .slice()
    .sort((a, b) => (a.employeeId?.fullName || '').localeCompare(b.employeeId?.fullName || ''));
}

async function getRecordOr404(organizationId, recordId) {
  const record = await PayrollRecord.findOne({ _id: recordId, organizationId });
  if (!record) throw fail(404, 'Payroll record not found.');
  return record;
}

async function requestCorrection(organizationId, actorUserId, recordId, { reason, proposedBasicEarnings, proposedDeductions }) {
  const record = await getRecordOr404(organizationId, recordId);
  if (!record.isFinalized) {
    throw fail(422, 'Only a finalized payroll record can be corrected — re-run generate() on an open period instead.');
  }

  const correction = await PayrollRecordCorrection.create({
    organizationId, payrollRecordId: record._id, requestedBy: actorUserId, reason,
    proposedBasicEarnings, proposedDeductions,
  });

  await recordAuditEvent({
    organizationId, actorUserId, action: 'payroll_record.correct.request', entityType: 'PayrollRecord', entityId: record._id,
    reason, newValue: { proposedBasicEarnings, proposedDeductions },
  });
  return correction;
}

async function approveCorrection(organizationId, actorUserId, recordId, correctionId) {
  const correction = await PayrollRecordCorrection.findOne({ _id: correctionId, organizationId });
  if (!correction || String(correction.payrollRecordId) !== String(recordId)) {
    throw fail(404, 'Payroll correction request not found.');
  }
  if (correction.status !== 'PENDING_APPROVAL') throw fail(409, 'This correction is not pending approval.');
  if (String(correction.requestedBy) === String(actorUserId)) {
    throw fail(403, 'A correction must be approved by a different SUPER_ADMIN than the one who requested it.');
  }

  const record = await getRecordOr404(organizationId, recordId);
  const previousValue = { basicEarnings: record.basicEarnings, deductions: record.deductions };

  record.basicEarnings = correction.proposedBasicEarnings;
  record.deductions = correction.proposedDeductions;
  record.netSalary = round2(correction.proposedBasicEarnings - correction.proposedDeductions);
  await record.save();

  correction.status = 'APPROVED';
  correction.approvedBy = actorUserId;
  correction.approvedAt = new Date();
  await correction.save();

  await recordAuditEvent({
    organizationId, actorUserId, action: 'payroll_record.correct.approve', entityType: 'PayrollRecord', entityId: record._id,
    reason: correction.reason, previousValue, newValue: { basicEarnings: record.basicEarnings, deductions: record.deductions },
  });
  return record;
}

module.exports = {
  computeEarnings,
  createPeriod,
  listPeriods,
  getPeriodOr404,
  setPayrollConfig,
  generateRecords,
  finalizePeriod,
  listRecordsForEmployee,
  listRecordsForPeriod,
  getRecordOr404,
  requestCorrection,
  approveCorrection,
};
