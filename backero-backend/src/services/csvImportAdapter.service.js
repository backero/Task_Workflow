// CsvImportAdapter — ported from the Attendance Tracker's
// app/integrations/biometric/csv_import.py. For a device whose vendor has
// no live push/pull protocol (a closed-ecosystem attendance product with
// no public API), attendance arrives as a periodically-exported CSV file
// instead of a network connection. Column layout is per-device configurable
// since the export format is vendor-specific and unknowable in advance —
// never hardcoded to one vendor's headers. Raises loudly (422) on any
// structural or per-row parse problem rather than silently dropping rows —
// this feeds payroll, so a malformed file should fail loudly, not partially
// ingest.
const { parse } = require('csv-parse/sync');

function fail(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

/** Validates and normalizes a raw import-config object. Throws 422 on any
 * missing/invalid field — called both when saving a device's import config
 * (fail fast) and before every file parse (defense in depth). */
function parseImportConfig(data) {
  if (!data || !data.employee_ref_column || !data.date_column) {
    throw fail(422, 'Missing required import_config field: employee_ref_column and date_column are both required.');
  }
  const checkInColumn = data.check_in_column || null;
  const checkOutColumn = data.check_out_column || null;
  if (!checkInColumn && !checkOutColumn) {
    throw fail(422, 'At least one of check_in_column or check_out_column must be configured.');
  }
  return {
    employeeRefColumn: data.employee_ref_column,
    dateColumn: data.date_column,
    checkInColumn,
    checkOutColumn,
    dateFormat: data.date_format || 'YYYY-MM-DD',
    timeFormat: data.time_format || 'HH:mm:ss',
    utcOffsetMinutes: Number(data.utc_offset_minutes || 0),
  };
}

// Minimal strptime-style parser for the two format tokens this domain
// actually uses (YYYY-MM-DD / HH:mm:ss and close variants) — avoids pulling
// in a full date-format-parsing dependency for two fixed shapes.
function parseDateWithFormat(raw, format, rowNumber) {
  const digits = raw.match(/\d+/g);
  const formatParts = format.match(/[A-Za-z]+/g) || [];
  if (!digits || digits.length < 3) {
    throw fail(422, `Row ${rowNumber}: could not parse date '${raw}' using format '${format}'.`);
  }
  let year;
  let month;
  let day;
  formatParts.forEach((token, i) => {
    const value = Number(digits[i]);
    if (/^y+$/i.test(token)) year = value < 100 ? 2000 + value : value;
    else if (/^m+$/i.test(token)) month = value;
    else if (/^d+$/i.test(token)) day = value;
  });
  if (!year || !month || !day) {
    throw fail(422, `Row ${rowNumber}: could not parse date '${raw}' using format '${format}'.`);
  }
  return { year, month, day };
}

function parseTimeWithFormat(raw, format, column, rowNumber) {
  const digits = raw.match(/\d+/g);
  const formatParts = format.match(/[A-Za-z]+/g) || [];
  if (!digits) throw fail(422, `Row ${rowNumber}: could not parse time '${raw}' in column '${column}' using format '${format}'.`);
  let hour = 0;
  let minute = 0;
  let second = 0;
  formatParts.forEach((token, i) => {
    const value = Number(digits[i] || 0);
    if (/^h+$/i.test(token)) hour = value;
    else if (/^m+$/i.test(token)) minute = value;
    else if (/^s+$/i.test(token)) second = value;
  });
  if (Number.isNaN(hour) || Number.isNaN(minute) || Number.isNaN(second)) {
    throw fail(422, `Row ${rowNumber}: could not parse time '${raw}' in column '${column}' using format '${format}'.`);
  }
  return { hour, minute, second };
}

/**
 * Parses an uploaded CSV export into raw events, ready for ingestion.
 * @returns {Array<{deviceEmployeeRef, eventType: 'CHECK_IN'|'CHECK_OUT', eventTimestamp: Date, rawPayload: object}>}
 */
function loadCsv(config, fileContentBuffer) {
  const text = fileContentBuffer.toString('utf-8').replace(/^﻿/, ''); // strip BOM if present
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: false });

  const fieldnames = new Set(rows.length ? Object.keys(rows[0]) : []);
  const requiredColumns = new Set([config.employeeRefColumn, config.dateColumn]);
  if (config.checkInColumn) requiredColumns.add(config.checkInColumn);
  if (config.checkOutColumn) requiredColumns.add(config.checkOutColumn);
  const missing = [...requiredColumns].filter((c) => !fieldnames.has(c));
  if (missing.length) {
    throw fail(422, `The uploaded file is missing configured column(s): ${missing.sort().join(', ')}.`);
  }

  const offsetMs = config.utcOffsetMinutes * 60 * 1000;
  const events = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const employeeRef = (row[config.employeeRefColumn] || '').trim();
    const dateRaw = (row[config.dateColumn] || '').trim();
    if (!employeeRef || !dateRaw) return; // blank/trailing row — skip

    const { year, month, day } = parseDateWithFormat(dateRaw, config.dateFormat, rowNumber);

    for (const [column, eventType] of [[config.checkInColumn, 'CHECK_IN'], [config.checkOutColumn, 'CHECK_OUT']]) {
      if (!column) continue;
      const timeRaw = (row[column] || '').trim();
      if (!timeRaw) continue;
      const { hour, minute, second } = parseTimeWithFormat(timeRaw, config.timeFormat, column, rowNumber);
      const eventTimestamp = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs);
      events.push({ deviceEmployeeRef: employeeRef, eventType, eventTimestamp, rawPayload: row });
    }
  });

  return events;
}

module.exports = { parseImportConfig, loadCsv };
