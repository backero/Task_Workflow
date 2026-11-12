const AttendanceLog = require('../models/AttendanceLog');
const Employee = require('../models/Employee');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const { ingestEvent } = require('../services/attendanceIngest.service');

// This self-service punch flow writes to AttendanceLog — the only part of
// the attendance system actually reachable from the UI — but Today's Board,
// Holidays/Exceptions, and Payroll's attendance summary all read from the
// separate AttendanceEvent/Attendance pipeline (attendanceProcessor.service.js),
// which nothing was feeding. Bridging each punch into that pipeline here
// so a real check-in shows up everywhere, not just on this punch widget.
// punch-in/break-end open a session (CHECK_IN); break-start/punch-out
// close one (CHECK_OUT) — this maps directly onto pairSessions()'s
// multi-session-per-day model, so breaks fall out of the existing gap
// calculation for free (see payslipPdf.service.js#dailyBreakHours).
const PUNCH_TO_EVENT_TYPE = {
  'punch-in': 'CHECK_IN',
  'break-end': 'CHECK_IN',
  'break-start': 'CHECK_OUT',
  'punch-out': 'CHECK_OUT',
};

async function bridgeToAttendanceEvent(req, employee, punchType, timestamp) {
  const eventType = PUNCH_TO_EVENT_TYPE[punchType];
  if (!eventType) return;
  try {
    await ingestEvent(employee.organizationId, {
      deviceEmployeeRef: employee.employeeCode,
      eventType,
      rawEvent: { punchType, source: 'self-service-punch', ...req.body },
      source: 'SELF_SERVICE',
      dedupeKey: `self-service:${employee._id}:${punchType}:${timestamp.toISOString()}`,
      eventTimestamp: timestamp,
    }, { io: req.app.get('io') });
  } catch (err) {
    // Best-effort — the self-service punch (AttendanceLog) is the system of
    // record for "did this person actually punch"; never fail that because
    // the secondary derived-status pipeline had a hiccup.
    // eslint-disable-next-line no-console
    console.error('[attendance.punch] failed to bridge to AttendanceEvent:', err.message);
  }
}

exports.recordPunch = asyncHandler(async (req, res) => {
  const { punchType, latitude, longitude, address } = req.body;
  const organizationId = req.user.organizationId;
  const userId = req.user._id;

  if (!['punch-in', 'break-start', 'break-end', 'punch-out'].includes(punchType)) {
    return sendError(res, 'Invalid punch type', 400);
  }

  const employee = await Employee.findOne({ userId, organizationId, deletedAt: null });
  if (!employee) {
    return sendError(res, 'Employee profile not found', 404);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let attendanceLog = await AttendanceLog.findOne({
    employeeId: employee._id,
    createdAt: { $gte: today, $lt: tomorrow }
  });

  const now = new Date();

  if (!attendanceLog) {
    if (punchType !== 'punch-in') {
      return sendError(res, 'Must punch in first', 400);
    }
    attendanceLog = new AttendanceLog({
      organizationId,
      employeeId: employee._id,
      userId,
      status: 'present',
      currentPunchStatus: 'office-in',
      punches: [{
        punchType: 'punch-in',
        timestamp: now,
        location: { type: 'Point', coordinates: [longitude, latitude] },
        address
      }],
      officeCheckInTime: now
    });
  } else {
    const lastPunch = attendanceLog.punches[attendanceLog.punches.length - 1];
    const validTransitions = {
      'not-punched': ['punch-in'],
      'office-in': ['break-start', 'punch-out'],
      'on-break': ['break-end'],
      'office-out': []
    };

    if (!validTransitions[attendanceLog.currentPunchStatus]?.includes(punchType)) {
      return sendError(res, `Cannot ${punchType} from ${attendanceLog.currentPunchStatus} state`, 400);
    }

    // Handle punch-in from not-punched state
    if (attendanceLog.currentPunchStatus === 'not-punched' && punchType === 'punch-in') {
      attendanceLog.officeCheckInTime = now;
      attendanceLog.currentPunchStatus = 'office-in';
    }

    attendanceLog.punches.push({
      punchType,
      timestamp: now,
      location: { type: 'Point', coordinates: [longitude, latitude] },
      address
    });

    if (punchType === 'break-start') {
      attendanceLog.breakStartTime = now;
      attendanceLog.currentPunchStatus = 'on-break';
    } else if (punchType === 'break-end') {
      if (attendanceLog.breakStartTime) {
        const breakMinutes = (now - attendanceLog.breakStartTime) / (1000 * 60);
        attendanceLog.breakDuration = (attendanceLog.breakDuration || 0) + breakMinutes;
        attendanceLog.breakEndTime = now;
      }
      attendanceLog.currentPunchStatus = 'office-in';
    } else if (punchType === 'punch-out') {
      attendanceLog.officeCheckOutTime = now;
      attendanceLog.currentPunchStatus = 'office-out';

      // Calculate total work hours
      if (attendanceLog.officeCheckInTime) {
        let totalMs = now - attendanceLog.officeCheckInTime;
        const breakMs = (attendanceLog.breakDuration || 0) * 60 * 1000;
        const workMs = totalMs - breakMs;
        attendanceLog.totalWorkHours = parseFloat((workMs / (1000 * 60 * 60)).toFixed(2));
        attendanceLog.totalBreakHours = parseFloat(((attendanceLog.breakDuration || 0) / 60).toFixed(2));
      }
    }
  }

  attendanceLog.updatedAt = now;
  await attendanceLog.save();
  await bridgeToAttendanceEvent(req, employee, punchType, now);

  sendSuccess(res, {
    attendance: attendanceLog,
    message: `${punchType} recorded successfully`
  }, null, 201);
});

exports.getTodayPunchStatus = asyncHandler(async (req, res) => {
  const organizationId = req.user.organizationId;
  const userId = req.user._id;

  const employee = await Employee.findOne({ userId, organizationId, deletedAt: null });
  if (!employee) {
    return sendError(res, 'Employee profile not found', 404);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const attendanceLog = await AttendanceLog.findOne({
    employeeId: employee._id,
    createdAt: { $gte: today, $lt: tomorrow }
  });

  if (!attendanceLog) {
    return sendSuccess(res, {
      status: 'not-punched',
      currentPunchStatus: 'not-punched',
      punches: [],
      message: 'No punches recorded today'
    });
  }

  // Calculate current work hours if still in office
  let currentWorkHours = attendanceLog.totalWorkHours || 0;
  if (attendanceLog.currentPunchStatus === 'office-in' && attendanceLog.officeCheckInTime) {
    const now = new Date();
    let totalMs = now - attendanceLog.officeCheckInTime;
    const breakMs = (attendanceLog.breakDuration || 0) * 60 * 1000;
    const workMs = totalMs - breakMs;
    currentWorkHours = parseFloat((workMs / (1000 * 60 * 60)).toFixed(2));
  }

  sendSuccess(res, {
    status: attendanceLog.currentPunchStatus,
    currentPunchStatus: attendanceLog.currentPunchStatus,
    punches: attendanceLog.punches,
    officeCheckInTime: attendanceLog.officeCheckInTime,
    officeCheckOutTime: attendanceLog.officeCheckOutTime,
    breakDuration: attendanceLog.breakDuration || 0,
    totalWorkHours: currentWorkHours,
    totalBreakHours: attendanceLog.totalBreakHours || 0
  });
});

exports.getPunchHistory = asyncHandler(async (req, res) => {
  const organizationId = req.user.organizationId;
  const userId = req.user._id;
  const days = parseInt(req.query.days || '30', 10);

  if (isNaN(days) || days < 1) {
    return sendError(res, 'Invalid days parameter', 400);
  }

  const employee = await Employee.findOne({ userId, organizationId, deletedAt: null });
  if (!employee) {
    return sendError(res, 'Employee profile not found', 404);
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const logs = await AttendanceLog.find({
    employeeId: employee._id,
    createdAt: { $gte: startDate }
  }).sort({ createdAt: -1 });

  sendSuccess(res, {
    logs,
    count: logs.length
  });
});
