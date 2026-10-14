// Attendance status-derivation engine — ported from processor.py. All time
// math is UTC-only (no per-employee/per-site timezone concept, matches the
// source exactly — do not introduce local-timezone conversion here).
const AttendanceEvent = require('../models/AttendanceEvent');
const Attendance = require('../models/Attendance');
const AttendanceStatusRule = require('../models/AttendanceStatusRule');
const Holiday = require('../models/Holiday');
const WorkScheduleConfig = require('../models/WorkScheduleConfig');
const LeaveRequest = require('../models/LeaveRequest');
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

function deriveStatus(checkIn, checkOut, targetDate, rules, workedHours) {
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

  // LATE takes priority over HALF_DAY, even if worked hours are also short
  // — a late arrival who also worked short hours is LATE, not HALF_DAY.
  if (checkIn.getTime() > shiftStart.getTime() + lateThresholdMs) return 'LATE';
  if (workedHours < halfDayMinHours) return 'HALF_DAY';
  return 'PRESENT';
}

/** Pairs a day's raw events into Keka-style multi-punch sessions: opens a
 * session on CHECK_IN (ignoring a repeat CHECK_IN while one is already
 * open), closes it on the next CHECK_OUT. A trailing open session (forgot
 * to punch out) contributes no closed session — checkOut stays null so
 * INCOMPLETE/MISSING_PUNCH semantics are unchanged. */
function pairSessions(events) {
  const sessions = [];
  let openCheckIn = null;
  for (const event of events) {
    if (event.eventType === 'CHECK_IN') {
      if (!openCheckIn) openCheckIn = event.eventTimestamp;
    } else if (event.eventType === 'CHECK_OUT' && openCheckIn) {
      sessions.push({ checkIn: openCheckIn, checkOut: event.eventTimestamp });
      openCheckIn = null;
    }
  }
  return { sessions, openCheckIn };
}

/** Effective weekly-off days for an org as of targetDate — same
 * fold-oldest-to-newest versioning as getEffectiveRules. */
async function getEffectiveWeekOffDays(organizationId, targetDate) {
  const rows = await WorkScheduleConfig.find({ organizationId, effectiveFrom: { $lte: targetDate } }).sort({ effectiveFrom: 1 });
  if (!rows.length) return [0]; // default: Sunday only
  return rows[rows.length - 1].weekOffDays;
}

/** Default status for a day with zero punches, in precedence order:
 * ON_LEAVE (an approved LeaveRequest covers this date) > HOLIDAY (org
 * calendar match, exact date or month+day if recurring) > WEEK_OFF (date's
 * day-of-week is in the org's current week-off config) > ABSENT. Never
 * called when real punches exist — actual attendance always wins. */
async function deriveDefaultStatus(organizationId, employeeId, targetDate) {
  const { start, end } = dayBoundsUTC(targetDate);
  const month = targetDate.getUTCMonth();
  const day = targetDate.getUTCDate();

  const onLeave = await LeaveRequest.exists({
    organizationId, employeeId, status: 'APPROVED', startDate: { $lte: targetDate }, endDate: { $gte: targetDate },
  });
  if (onLeave) return 'ON_LEAVE';

  const holidays = await Holiday.find({ organizationId });
  const isHoliday = holidays.some((h) => {
    if (h.isRecurringAnnually) return h.date.getUTCMonth() === month && h.date.getUTCDate() === day;
    return h.date.getTime() >= start.getTime() && h.date.getTime() < end.getTime();
  });
  if (isHoliday) return 'HOLIDAY';

  const weekOffDays = await getEffectiveWeekOffDays(organizationId, targetDate);
  if (weekOffDays.includes(targetDate.getUTCDay())) return 'WEEK_OFF';

  return 'ABSENT';
}

/** Pure computation, no writes. */
async function derive(organizationId, employeeId, targetDate) {
  const { start, end } = dayBoundsUTC(targetDate);
  const events = await AttendanceEvent.find({
    organizationId, employeeId, eventTimestamp: { $gte: start, $lt: end },
  }).sort({ eventTimestamp: 1 });

  if (!events.length) {
    const status = await deriveDefaultStatus(organizationId, employeeId, targetDate);
    return { status, checkIn: null, checkOut: null, sessions: [], workedHours: 0 };
  }

  const { sessions, openCheckIn } = pairSessions(events);
  const checkIn = sessions.length ? sessions[0].checkIn : openCheckIn;
  const checkOut = sessions.length ? sessions[sessions.length - 1].checkOut : null;
  const workedHours = sessions.reduce((sum, s) => sum + (s.checkOut.getTime() - s.checkIn.getTime()) / (1000 * 60 * 60), 0);

  const rules = await getEffectiveRules(organizationId, targetDate);
  const status = deriveStatus(checkIn, checkOut, targetDate, rules, workedHours);
  return { status, checkIn, checkOut, sessions, workedHours };
}

function publishAttendanceUpdated(io, organizationId, employee, attendance) {
  if (!io) return;
  const payload = {
    employeeId: String(employee._id),
    attendanceDate: attendance.attendanceDate.toISOString().slice(0, 10),
    checkIn: attendance.checkIn ? attendance.checkIn.toISOString() : null,
    checkOut: attendance.checkOut ? attendance.checkOut.toISOString() : null,
    sessions: attendance.sessions,
    workedHours: attendance.workedHours,
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
  const { status, checkIn, checkOut, sessions, workedHours } = await derive(organizationId, employeeId, targetDate);
  const period = await getOrCreatePeriodForDate(organizationId, targetDate);

  // Atomic upsert — mirrors the source's INSERT...ON CONFLICT DO UPDATE:
  // on conflict, only the derived fields are overwritten; isCorrected/
  // correctionHistory are left untouched (set only on insert), so a plain
  // re-derivation never resets a previously-applied correction's flag/history.
  const attendance = await Attendance.findOneAndUpdate(
    { organizationId, employeeId, attendanceDate: targetDate },
    {
      $set: { attendancePeriodId: period._id, checkIn, checkOut, sessions, workedHours, status },
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

module.exports = { getEffectiveRules, getEffectiveWeekOffDays, deriveStatus, derive, process, preview, dayBoundsUTC };
