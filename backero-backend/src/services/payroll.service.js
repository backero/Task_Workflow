// Payroll foundation — ported from the Attendance Tracker's
// app/modules/payroll/service.py. Basic earnings/deductions only —
// deliberately NO statutory rules (tax, PF, ESI); see computeEarnings for
// the exact, explicitly-documented assumption this makes.
const PayrollPeriod = require('../models/PayrollPeriod');
const PayrollRecord = require('../models/PayrollRecord');
const PayrollRecordCorrection = require('../models/PayrollRecordCorrection');
const Employee = require('../models/Employee');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const EmployeeAdvanceRepayment = require('../models/EmployeeAdvanceRepayment');
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

async function advanceDeductionsFor(organizationId, employeeId) {
  const advances = await EmployeeAdvance.find({ organizationId, employeeId, status: 'APPROVED', remainingBalance: { $gt: 0 } }).select('monthlyInstallment remainingBalance');
  return advances.map((advance) => ({
    advanceId: advance._id,
    amount: round2(Math.min(Number(advance.monthlyInstallment || 0), Number(advance.remainingBalance || 0))),
  })).filter((item) => item.amount > 0);
}

/** Assumption (no statutory rules, foundation scope): basicEarnings is
 * always the full configured monthly salary. deductions is a per-day rate
 * (basicMonthlySalary / totalDays in the period) applied to
 * unpaid-day-equivalents, where an absent day counts as 1 and a half day
 * counts as 0.5 — paidLeaveDays (ON_LEAVE/HOLIDAY/WEEK_OFF) are never
 * deducted. If the period has zero attendance rows at all, the whole
 * period is treated as unpaid (deductions == basicEarnings) rather than
 * dividing by zero.
 *
 * payType 'FIXED' (freelancers/retainers — independent of `category`, which only
 * drives location tracking) skips all of that: they're paid the full configured
 * amount every period regardless of attendance, by definition of "fixed". */
function computeEarnings(basicMonthlySalary, summary, payType = 'ATTENDANCE_BASED') {
  const basicEarnings = round2(basicMonthlySalary);
  if (payType === 'FIXED') {
    return { basicEarnings, deductions: 0, netSalary: basicEarnings };
  }
  if (summary.totalDays === 0) {
    return { basicEarnings, deductions: basicEarnings, netSalary: 0 };
  }
  const perDayRate = basicMonthlySalary / summary.totalDays;
  const unpaidDayEquivalents = summary.absentDays + summary.halfDays * 0.5;
  const deductions = round2(perDayRate * unpaidDayEquivalents);
  const netSalary = round2(basicEarnings - deductions);
  return { basicEarnings, deductions, netSalary };
}

/** Net pay from every line item on a record — basic/attendance-deduction plus whatever
 * manual earnings/deductions an admin has entered (DA/HRA/bonus/LTA/special allowance/
 * telephone reimbursement as additions; PF/ESIC/income tax/professional tax/loan-advance
 * as deductions). Used both at generation time and whenever the manual fields are edited,
 * so neither path can silently under/overwrite the other's contribution to net pay. */
function computeNetSalary(record) {
  const totalEarnings = round2(
    (record.basicEarnings || 0) + (record.dearnessAllowance || 0) + (record.houseRentAllowance || 0)
    + (record.bonus || 0) + (record.lta || 0) + (record.specialAllowance || 0) + (record.telephoneReimbursement || 0),
  );
  const totalDeductions = round2(
    (record.deductions || 0) + (record.pf || 0) + (record.esic || 0)
    + (record.incomeTax || 0) + (record.professionalTax || 0) + (record.loanAdvance || 0),
  );
  return { totalEarnings, totalDeductions, netSalary: round2(Math.max(0, totalEarnings - totalDeductions)) };
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
    const earnings = computeEarnings(employee.basicMonthlySalary, summary, employee.payType);
    // eslint-disable-next-line no-await-in-loop
    const advanceDeductions = await advanceDeductionsFor(organizationId, employee._id);
    const loanAdvance = round2(advanceDeductions.reduce((sum, item) => sum + item.amount, 0));
    const basicEarnings = earnings.basicEarnings;
    const deductions = earnings.deductions;

    const existing = existingByEmployee.get(String(employee._id));
    if (existing) {
      existing.basicEarnings = basicEarnings;
      existing.deductions = deductions;
      existing.loanAdvance = loanAdvance;
      existing.advanceDeductions = advanceDeductions;
      existing.attendanceSummarySnapshot = summary;
      // Recomputed from every line item, not just earnings.netSalary — preserves whatever
      // manual DA/HRA/bonus/LTA/special-allowance/PF/ESIC/tax entries an admin already made
      // on this record rather than silently wiping their contribution to net pay.
      existing.netSalary = computeNetSalary(existing).netSalary;
      // eslint-disable-next-line no-await-in-loop
      await existing.save();
    } else {
      const netSalary = computeNetSalary({ basicEarnings, deductions, loanAdvance }).netSalary;
      // eslint-disable-next-line no-await-in-loop
      await PayrollRecord.create({
        organizationId,
        payrollPeriodId: period._id,
        employeeId: employee._id,
        basicEarnings,
        deductions,
        netSalary,
        loanAdvance,
        advanceDeductions,
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
  for (const record of records) {
    for (const item of record.advanceDeductions || []) {
      // The unique index makes finalization idempotent even if a retry lands
      // after the period status changed but before a response was returned.
      try {
        // eslint-disable-next-line no-await-in-loop
        await EmployeeAdvanceRepayment.create({ organizationId, advanceId: item.advanceId, payrollPeriodId: period._id, payrollRecordId: record._id, amount: item.amount, appliedBy: actorUserId });
        // eslint-disable-next-line no-await-in-loop
        const advance = await EmployeeAdvance.findOneAndUpdate(
          { _id: item.advanceId, organizationId, status: 'APPROVED', remainingBalance: { $gt: 0 } },
          { $inc: { remainingBalance: -item.amount } }, { new: true },
        );
        if (advance && advance.remainingBalance <= 0) {
          advance.remainingBalance = 0;
          advance.status = 'CLOSED';
          // eslint-disable-next-line no-await-in-loop
          await advance.save();
        }
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
  }
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

/** Every record in a period, joined to its Employee for display, each
 * paired with its PENDING_APPROVAL correction (if any) — there was
 * previously no way to see a pending correction anywhere in the UI, so
 * approveCorrection had no caller; this is what makes approve/reject usable. */
async function listRecordsForPeriod(organizationId, periodId) {
  await getPeriodOr404(organizationId, periodId);
  const records = await PayrollRecord.find({ organizationId, payrollPeriodId: periodId }).populate('employeeId', 'employeeCode fullName');
  const recordIds = records.map((r) => r._id);
  const pendingCorrections = await PayrollRecordCorrection.find({
    organizationId, payrollRecordId: { $in: recordIds }, status: 'PENDING_APPROVAL',
  });
  const correctionByRecordId = new Map(pendingCorrections.map((c) => [String(c.payrollRecordId), c]));

  return records
    .slice()
    .sort((a, b) => (a.employeeId?.fullName || '').localeCompare(b.employeeId?.fullName || ''))
    .map((record) => ({ record, pendingCorrection: correctionByRecordId.get(String(record._id)) || null }));
}

async function getRecordOr404(organizationId, recordId) {
  const record = await PayrollRecord.findOne({ _id: recordId, organizationId });
  if (!record) throw fail(404, 'Payroll record not found.');
  return record;
}

const LINE_ITEM_FIELDS = [
  'dearnessAllowance', 'houseRentAllowance', 'bonus', 'lta', 'specialAllowance',
  'telephoneReimbursement', 'pf', 'esic', 'incomeTax', 'professionalTax',
];

/** Direct edit of a draft record's manual payslip line items (DA/HRA/bonus/LTA/special
 * allowance/telephone reimbursement/PF/ESIC/income tax/professional tax) — separate from
 * requestCorrection/approveCorrection, which is specifically the dual-approval flow for
 * FINALIZED records. A record still in draft (not yet finalized) hasn't been paid out yet,
 * so there's nothing to approve here — the generating admin can just fix it directly. */
async function updateLineItems(organizationId, actorUserId, recordId, fields) {
  const record = await getRecordOr404(organizationId, recordId);
  if (record.isFinalized) {
    throw fail(422, 'This record is finalized — use Request Correction instead of a direct edit.');
  }

  const previousValue = {};
  for (const key of LINE_ITEM_FIELDS) {
    if (fields[key] === undefined) continue;
    previousValue[key] = record[key];
    record[key] = round2(Number(fields[key]) || 0);
  }
  record.netSalary = computeNetSalary(record).netSalary;
  await record.save();

  await recordAuditEvent({
    organizationId, actorUserId, action: 'payroll_record.line_items.update', entityType: 'PayrollRecord', entityId: record._id,
    previousValue, newValue: fields,
  });
  return record;
}

async function requestCorrection(organizationId, actorUserId, recordId, { reason, proposedBasicEarnings, proposedDeductions }) {
  const record = await getRecordOr404(organizationId, recordId);
  if (!record.isFinalized) {
    throw fail(422, 'Only a finalized payroll record can be corrected — re-run generate() on an open period instead.');
  }

  const existingPending = await PayrollRecordCorrection.findOne({
    organizationId, payrollRecordId: record._id, status: 'PENDING_APPROVAL',
  });
  if (existingPending) throw fail(409, 'A correction request is already pending approval for this record.');

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

async function rejectCorrection(organizationId, actorUserId, recordId, correctionId, reason) {
  const correction = await PayrollRecordCorrection.findOne({ _id: correctionId, organizationId });
  if (!correction || String(correction.payrollRecordId) !== String(recordId)) {
    throw fail(404, 'Payroll correction request not found.');
  }
  if (correction.status !== 'PENDING_APPROVAL') throw fail(409, 'This correction is not pending approval.');
  if (String(correction.requestedBy) === String(actorUserId)) {
    throw fail(403, 'A correction must be reviewed by a different SUPER_ADMIN than the one who requested it.');
  }

  correction.status = 'REJECTED';
  correction.approvedBy = actorUserId;
  correction.approvedAt = new Date();
  await correction.save();

  await recordAuditEvent({
    organizationId, actorUserId, action: 'payroll_record.correct.reject', entityType: 'PayrollRecord', entityId: correction.payrollRecordId,
    reason, previousValue: { status: 'PENDING_APPROVAL' }, newValue: { status: 'REJECTED' },
  });
  return correction;
}

async function reopenPeriod(organizationId, actorUserId, periodId) {
  const period = await getPeriodOr404(organizationId, periodId);
  if (period.status !== 'FINALIZED') throw fail(409, 'This payroll period is not finalized.');

  await PayrollRecord.updateMany(
    { organizationId, payrollPeriodId: period._id },
    { $set: { isFinalized: false, finalizedAt: null } },
  );

  period.status = 'OPEN';
  period.finalizedAt = null;
  period.finalizedBy = null;
  await period.save();

  await recordAuditEvent({
    organizationId, actorUserId, action: 'payroll_period.reopen', entityType: 'PayrollPeriod', entityId: period._id,
    previousValue: { status: 'FINALIZED' }, newValue: { status: 'OPEN' },
  });
  return period;
}

module.exports = {
  computeEarnings,
  computeNetSalary,
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
  rejectCorrection,
  reopenPeriod,
  updateLineItems,
};
