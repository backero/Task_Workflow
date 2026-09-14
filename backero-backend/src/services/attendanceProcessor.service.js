// Attendance status-derivation engine — ported from processor.py. All time
// math is UTC-only (no per-employee/per-site timezone concept, matches the
// source exactly — do not introduce local-timezone conversion here).
const AttendanceEvent = require('../models/AttendanceEvent');
const Attendance = require('../models/Attendance');
const AttendanceStatusRule = require('../models/AttendanceStatusRule');
const Employee = require('../models/Employee');
const { DEFAULT_ATTENDANCE_RULES } = require('../utils/attendanceConstants');
const { getOrCreatePeriodForDate } = require('./attendancePeriods.service');

function dayBoundsUTC(targetDate) {
  const start = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Folds all AttendanceStatusRule rows with effectiveFrom <= targetDate,
 * oldest to newest, so the most recently-effective row per ruleKey wins —
 * NOT a naive "take the single most recent row" (see processor.py comment). */
async function getEffectiveRules(organizationId, targetDate) {
  const rows = await AttendanceStatusRule.find({ organizationId, effectiveFrom: { $lte: targetDate } }).sort({ effectiveFrom: 1 });
  const effective = { ...DEFAULT_ATTENDANCE_RULES };
  for (const row of rows) {
    effective[row.ruleKey] = row.value;
  }
  return effective;
}

function deriveStatus(checkIn, checkOut, targetDate, rules) {
  if (!checkIn) return 'ABSENT';

  if (!checkOut) {
    const todayUTC = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    return targetDate.getTime() >= todayUTC.getTime() ? 'INCOMPLETE' : 'MISSING_PUNCH';
  }

  const [shiftHour, shiftMinute] = String(rules.SHIFT_START_TIME).split(':').map(Number);
  const shiftStart = new Date(Date.UTC(
    targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), shiftHour, shiftMinute,
  ));
  const lateThresholdMs = Number(rules.LATE_THRESHOLD_MINUTES) * 60 * 1000;
  const halfDayMinHours = Number(rules.HALF_DAY_MIN_HOURS);
  const workedHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);

  // LATE takes priority over HALF_DAY, even if worked hours are also short
  // — a late arrival who also worked short hours is LATE, not HALF_DAY.
  if (checkIn.getTime() > shiftStart.getTime() + lateThresholdMs) return 'LATE';
  if (workedHours < halfDayMinHours) return 'HALF_DAY';
  return 'PRESENT';
}

/** Pure computation, no writes. */
async function derive(organizationId, employeeId, targetDate) {
  const { start, end } = dayBoundsUTC(targetDate);
  const events = await AttendanceEvent.find({
    organizationId, employeeId, eventTimestamp: { $gte: start, $lt: end },
  }).sort({ eventTimestamp: 1 });

  const checkIns = events.filter((e) => e.eventType === 'CHECK_IN').map((e) => e.eventTimestamp);
  const checkIn = checkIns.length ? new Date(Math.min(...checkIns.map((d) => d.getTime()))) : null;

  let checkOut = null;
  if (checkIn) {
    const checkOutsAfter = events
      .filter((e) => e.eventType === 'CHECK_OUT' && e.eventTimestamp.getTime() > checkIn.getTime())
      .map((e) => e.eventTimestamp);
    checkOut = checkOutsAfter.length ? new Date(Math.max(...checkOutsAfter.map((d) => d.getTime()))) : null;
  }

  const rules = await getEffectiveRules(organizationId, targetDate);
  const status = deriveStatus(checkIn, checkOut, targetDate, rules);
  return { status, checkIn, checkOut };
}

function publishAttendanceUpdated(io, organizationId, employee, attendance) {
  if (!io) return;
  const payload = {
    employeeId: String(employee._id),
    attendanceDate: attendance.attendanceDate.toISOString().slice(0, 10),
    checkIn: attendance.checkIn ? attendance.checkIn.toISOString() : null,
    checkOut: attendance.checkOut ? attendance.checkOut.toISOString() : null,
    status: attendance.status,
    timestamp: new Date().toISOString(),
  };
  // No per-permission room system exists in this backend — broadcast to the
  // org room (attendance:read-gated UI simply ignores the event otherwise)
  // plus the employee's own user room if they have portal access.
  if (employee.userId) io.to(`user:${employee.userId}`).emit('attendance:updated', payload);
  io.to(`org:${organizationId}`).emit('attendance:updated', payload);
}

/** The writing entry point — re-derives and upserts the Attendance row for
 * (employeeId, targetDate), then publishes a live-update event. */
async function process(organizationId, employeeId, targetDate, { io } = {}) {
  const { status, checkIn, checkOut } = await derive(organizationId, employeeId, targetDate);
  const period = await getOrCreatePeriodForDate(organizationId, targetDate);

  // Atomic upsert — mirrors the source's INSERT...ON CONFLICT DO UPDATE:
  // on conflict, only the derived fields are overwritten; isCorrected/
  // correctionHistory are left untouched (set only on insert), so a plain
  // re-derivation never resets a previously-applied correction's flag/history.
  const attendance = await Attendance.findOneAndUpdate(
    { organizationId, employeeId, attendanceDate: targetDate },
    {
      $set: { attendancePeriodId: period._id, checkIn, checkOut, status },
      $setOnInsert: { organizationId, employeeId, attendanceDate: targetDate, isCorrected: false, correctionHistory: [] },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const employee = await Employee.findById(employeeId);
  if (employee) publishAttendanceUpdated(io, organizationId, employee, attendance);

  return attendance;
}

/** Read-only — same derivation, never writes. Used only by reprocess's
 * FINALIZED-period discrepancy detection. */
async function preview(organizationId, employeeId, targetDate) {
  return derive(organizationId, employeeId, targetDate);
}

module.exports = { getEffectiveRules, deriveStatus, derive, process, preview, dayBoundsUTC };
