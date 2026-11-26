// Bulk import of a historical monthly attendance sheet (the wide format the HR team
// already uses: one row per employee, one column per calendar day holding a day-status
// code) into the real Attendance pipeline — for months attendance was tracked in Excel
// before this system existed, so payroll generation (payroll.service.js#generateRecords,
// via attendanceSummary.service.js) sees the same historical data an admin would see.
//
// Employees are matched by full name (not the sheet's own "Employee ID" column — that's
// a legacy numbering scheme from the old Excel process and doesn't correspond to this
// system's employeeCode at all, confirmed against a real sample).
const ExcelJS = require('exceljs');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const AttendancePeriod = require('../models/AttendancePeriod');
const { recordAuditEvent } = require('./attendanceAudit.service');

function fail(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

function str(val) {
  return val === null || val === undefined ? '' : String(val).trim();
}

// Confirmed against a real sheet sample + how payroll.service.js#computeEarnings actually
// uses the status (only ABSENT/HALF_DAY reduce pay — everything else is a fully paid day).
// LWP ("Leave Without Pay") maps to ABSENT because this system has no separate unpaid-leave
// status; ABSENT is the only status that actually produces a deduction, which is the whole
// point of "without pay".
const DAY_CODE_TO_STATUS = {
  FD: 'PRESENT',
  HD: 'HALF_DAY',
  A: 'ABSENT',
  WO: 'WEEK_OFF',
  H: 'HOLIDAY',
  SL: 'ON_LEAVE',
  C: 'ON_LEAVE',
  LWP: 'ABSENT',
};

// Header cells look like "21-10-2026 \n Wednesday" — only the leading DD-MM-YYYY matters.
const DATE_HEADER_RE = /^(\d{2})-(\d{2})-(\d{4})/;

function parseDateHeader(headerText) {
  const m = DATE_HEADER_RE.exec(str(headerText));
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
}

async function loadWorkbook(buffer, originalName) {
  const wb = new ExcelJS.Workbook();
  if (str(originalName).toLowerCase().endsWith('.csv')) {
    await wb.csv.read(require('stream').Readable.from(buffer));
  } else {
    await wb.xlsx.load(buffer);
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw fail(422, 'The uploaded file has no worksheet.');
  return sheet;
}

/** First 11 columns are fixed (Employee ID.. Total Days); every column after that is a
 * calendar day. Reading the header row to find where the date columns actually start
 * rather than hardcoding 11, in case a future month's sheet adds/removes a summary column. */
function readSheet(sheet) {
  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => { headers[colNumber] = str(cell.value); });

  const dateColumns = [];
  headers.forEach((h, colNumber) => {
    const date = parseDateHeader(h);
    if (date) dateColumns.push({ colNumber, date });
  });
  if (!dateColumns.length) throw fail(422, 'No date columns found in the header row — expected headers like "21-10-2026".');

  // headers[0] is always undefined (ExcelJS columns are 1-indexed, this array isn't) — guard
  // against it rather than crashing on the first forEach/findIndex pass.
  const nameColIndex = headers.findIndex((h) => h && h.toLowerCase() === 'employee name');
  if (nameColIndex === -1) throw fail(422, 'Expected an "Employee Name" column.');

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = str(row.getCell(nameColIndex).value);
    if (!name) return;
    const days = dateColumns.map(({ colNumber, date }) => ({ date, code: str(row.getCell(colNumber).value).toUpperCase() }));
    rows.push({ rowNumber, name, days });
  });
  return rows;
}

// Confirmed against a real sheet: exact-match alone found only 3 of 15 names. The sheet's
// names differ from this system's Employee.fullName by missing middle initials, missing
// spaces, and in a few cases genuine typos/spelling differences on one side or the other
// (e.g. the sheet's "Krishnaveni R" is this system's own misspelled "Krisnaveni veni") that
// no generic normalization can safely resolve — owner-confirmed once, kept here since the
// same monthly sheet template repeats these exact names every month.
const NAME_OVERRIDES = {
  'surya raj b': 'surya raj',
  'dinya rithcy': 'diniya ritchy',
  'krishnaveni r': 'krisnaveni veni',
  'anandh m': 'anandh a',
  'jesindhamary s': 'jessy s',
};

function normalizeName(name) {
  return str(name).toLowerCase().replace(/[^a-z]/g, '');
}

async function findEmployeeByName(organizationId, name, cache, employeeIndex) {
  const key = name.toLowerCase().trim();
  if (cache.has(key)) return cache.get(key);

  const overridden = NAME_OVERRIDES[key];
  const normalized = normalizeName(overridden || name);
  const employee = employeeIndex.get(normalized) || null;
  cache.set(key, employee);
  return employee;
}

/** All active employees in the org, keyed by normalized full name (letters only, lowercase)
 * — built once per import so a sheet's missing middle initials/spacing ("Suriya Priya" vs
 * "Suriya Priya M", "Alagushakthi" vs "Alagu Shakthi") still match without needing an
 * override, while anything that still doesn't resolve is reported rather than guessed. */
async function buildEmployeeIndex(organizationId) {
  const employees = await Employee.find({ organizationId, deletedAt: null }).select('fullName');
  const index = new Map();
  for (const emp of employees) {
    const full = normalizeName(emp.fullName);
    index.set(full, emp);
    // Also index with each trailing single-letter token dropped, so "Suriya Priya M"
    // is reachable via "Suriya Priya" without the sheet needing the initial.
    const words = str(emp.fullName).trim().split(/\s+/);
    if (words.length > 1 && words[words.length - 1].length === 1) {
      index.set(normalizeName(words.slice(0, -1).join(' ')), emp);
    }
  }
  return index;
}

async function findPeriodForDate(organizationId, date, cache) {
  const key = date.toISOString().slice(0, 10);
  if (cache.has(key)) return cache.get(key);
  const period = await AttendancePeriod.findOne({ organizationId, periodStart: { $lte: date }, periodEnd: { $gte: date } });
  cache.set(key, period);
  return period;
}

async function importAttendanceSheet(organizationId, actorUserId, buffer, originalName) {
  const sheet = await loadWorkbook(buffer, originalName);
  const rows = readSheet(sheet);
  if (!rows.length) throw fail(422, 'No employee rows found in the uploaded file.');

  const employeeIndex = await buildEmployeeIndex(organizationId);
  const employeeCache = new Map();
  const periodCache = new Map();
  const results = { employeesImported: 0, daysImported: 0, daysSkipped: [], employeesNotFound: [] };

  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    const employee = await findEmployeeByName(organizationId, row.name, employeeCache, employeeIndex);
    if (!employee) {
      results.employeesNotFound.push({ row: row.rowNumber, name: row.name });
      continue;
    }

    let importedForThisEmployee = 0;
    for (const { date, code } of row.days) {
      if (!code) continue;
      const status = DAY_CODE_TO_STATUS[code];
      if (!status) {
        results.daysSkipped.push({ row: row.rowNumber, name: row.name, date: date.toISOString().slice(0, 10), reason: `Unrecognized code '${code}'` });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const period = await findPeriodForDate(organizationId, date, periodCache);
      if (!period) {
        results.daysSkipped.push({ row: row.rowNumber, name: row.name, date: date.toISOString().slice(0, 10), reason: 'No payroll period covers this date' });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const existing = await Attendance.findOne({ organizationId, employeeId: employee._id, attendanceDate: date });
      // Never clobber a day that already has real punch data (checkIn set) — this import
      // is for backfilling months that only ever existed in Excel, not for overwriting
      // genuine live attendance.
      if (existing && existing.checkIn) {
        results.daysSkipped.push({ row: row.rowNumber, name: row.name, date: date.toISOString().slice(0, 10), reason: 'Already has real punch data — not overwritten' });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await Attendance.findOneAndUpdate(
        { organizationId, employeeId: employee._id, attendanceDate: date },
        { organizationId, employeeId: employee._id, attendancePeriodId: period._id, attendanceDate: date, status },
        { upsert: true, setDefaultsOnInsert: true },
      );
      importedForThisEmployee += 1;
      results.daysImported += 1;
    }
    if (importedForThisEmployee > 0) results.employeesImported += 1;
  }

  await recordAuditEvent({
    organizationId, actorUserId, action: 'attendance.import_sheet', entityType: 'Attendance', entityId: null,
    newValue: { employeesImported: results.employeesImported, daysImported: results.daysImported, employeesNotFoundCount: results.employeesNotFound.length },
  });

  return results;
}

module.exports = { importAttendanceSheet, DAY_CODE_TO_STATUS };
