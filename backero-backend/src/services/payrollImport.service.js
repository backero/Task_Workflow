// Bulk import of an already-paid salary Excel export into a single payroll
// period — for payroll that was run outside this system (e.g. in Excel)
// before this feature existed, so historical payslips can still be
// generated/downloaded for it. One file = one period (the admin picks or
// creates the period first, then uploads that period's sheet).
const ExcelJS = require('exceljs');
const Employee = require('../models/Employee');
const PayrollRecord = require('../models/PayrollRecord');
const { getPeriodOr404 } = require('./payroll.service');
const { recordAuditEvent } = require('./attendanceAudit.service');

function fail(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

function num(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function str(val) {
  return val === null || val === undefined ? '' : String(val).trim();
}

async function parseSheet(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw fail(422, 'The uploaded file has no worksheet.');

  const headers = [];
  const rows = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) {
      row.eachCell((cell) => headers.push(str(cell.value).toLowerCase()));
    } else {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row.getCell(i + 1).value; });
      // Skip fully blank trailing rows
      if (Object.values(obj).some((v) => str(v) !== '')) rows.push({ _rowNum: rowNum, ...obj });
    }
  });
  return rows;
}

/** Matches the exact column set from the HR team's existing paid-salary
 * export: Employee ID, Employee Name, Department, Designation, Full Day,
 * Half Day, Off Days, Paid Leave, Paid Days, Unpaid Days, Basic Salary,
 * Dearness Allowance (DA), House Rent Allowance (HRA), Daily Wage, Gross
 * Earnings, PF, ESIC, Loan / Advance, Net Pay (To Pay), Bank Name, IFSC
 * Code, Bank Account No, Bank Branch Name, Account Type. */
async function importPaidSalaries(organizationId, actorUserId, periodId, buffer) {
  const period = await getPeriodOr404(organizationId, periodId);
  const rows = await parseSheet(buffer);
  if (!rows.length) throw fail(422, 'No data rows found in the uploaded file.');

  const results = { imported: 0, skipped: [] };

  for (const row of rows) {
    const employeeCode = str(row['employee id']);
    if (!employeeCode) {
      results.skipped.push({ row: row._rowNum, reason: 'Missing Employee ID' });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const employee = await Employee.findOne({ organizationId, employeeCode, deletedAt: null });
    if (!employee) {
      results.skipped.push({ row: row._rowNum, reason: `No employee found with code '${employeeCode}'` });
      continue;
    }

    const basicSalary = num(row['basic salary']);
    const da = num(row['dearness allowance (da)']);
    const hra = num(row['house rent allowance (hra)']);
    const grossEarnings = row['gross earnings'] != null && str(row['gross earnings']) !== ''
      ? num(row['gross earnings']) : basicSalary + da + hra;
    const pf = num(row['pf']);
    const esic = num(row['esic']);
    const loanAdvance = num(row['loan / advance']);
    const netSalary = row['net pay (to pay)'] != null && str(row['net pay (to pay)']) !== ''
      ? num(row['net pay (to pay)']) : grossEarnings - (pf + esic + loanAdvance);

    const attendanceSummarySnapshot = {
      fullDays: num(row['full day']),
      halfDays: num(row['half day']),
      offDays: num(row['off days']),
      paidLeaveDays: num(row['paid leave']),
      paidDays: num(row['paid days']),
      unpaidDays: num(row['unpaid days']),
    };

    // eslint-disable-next-line no-await-in-loop
    await PayrollRecord.findOneAndUpdate(
      { organizationId, payrollPeriodId: period._id, employeeId: employee._id },
      {
        organizationId, payrollPeriodId: period._id, employeeId: employee._id,
        basicEarnings: basicSalary, deductions: pf + esic + loanAdvance, netSalary,
        dearnessAllowance: da, houseRentAllowance: hra, grossEarnings, pf, esic, loanAdvance,
        attendanceSummarySnapshot, isFinalized: true, finalizedAt: new Date(), source: 'IMPORTED',
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    // Bank details live on the employee (per-person, not per-period) —
    // fill them in from whichever import row has them, overwriting any
    // earlier value since the Excel is the authoritative HR source.
    const bankName = str(row['bank name']);
    const bankIfsc = str(row['ifsc code']);
    const bankAccountNumber = str(row['bank account no']);
    const bankBranch = str(row['bank branch name']);
    const bankAccountType = str(row['account type']);
    if (bankName || bankIfsc || bankAccountNumber || bankBranch || bankAccountType) {
      employee.bankName = bankName || employee.bankName;
      employee.bankIfsc = bankIfsc || employee.bankIfsc;
      employee.bankAccountNumber = bankAccountNumber || employee.bankAccountNumber;
      employee.bankBranch = bankBranch || employee.bankBranch;
      employee.bankAccountType = bankAccountType || employee.bankAccountType;
      // eslint-disable-next-line no-await-in-loop
      await employee.save();
    }

    results.imported += 1;
  }

  if (period.status !== 'FINALIZED') {
    period.status = 'FINALIZED';
    period.finalizedAt = new Date();
    period.finalizedBy = actorUserId;
    await period.save();
  }

  await recordAuditEvent({
    organizationId, actorUserId, action: 'payroll_period.import', entityType: 'PayrollPeriod', entityId: period._id,
    newValue: { imported: results.imported, skippedCount: results.skipped.length },
  });

  return results;
}

module.exports = { importPaidSalaries };
