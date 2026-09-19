// Attendance controller — ported from the Attendance Tracker's
// app/modules/attendance/router.py + service.py. See services/
// attendanceProcessor.service.js for the status-derivation engine this
// controller drives via correction/approval.
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const AttendanceEvent = require('../models/AttendanceEvent');
const AttendanceCorrection = require('../models/AttendanceCorrection');
const AttendancePeriod = require('../models/AttendancePeriod');
const Employee = require('../models/Employee');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { recordAuditEvent } = require('../services/attendanceAudit.service');
const processor = require('../services/attendanceProcessor.service');
const { getOrCreatePeriodForDate } = require('../services/attendancePeriods.service');

function toUTCDate(value) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// --- GET /attendance/me ---
exports.getMyAttendance = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ userId: req.user._id, deletedAt: null });
  if (!employee) return sendError(res, 'No employee profile is linked to your account yet.', 404);

  const q = { organizationId: req.user.organizationId, employeeId: employee._id };
  if (req.query.date_from) q.attendanceDate = { ...q.attendanceDate, $gte: toUTCDate(req.query.date_from) };
  if (req.query.date_to) q.attendanceDate = { ...q.attendanceDate, $lte: toUTCDate(req.query.date_to) };

  const rows = await Attendance.find(q).sort({ attendanceDate: -1 });
  sendSuccess(res, { attendance: rows });
});

// --- POST /attendance/punch --- self-service check-in/check-out toggle.
exports.punch = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const employee = await Employee.findOne({ organizationId: orgId, userId: req.user._id, deletedAt: null });
  if (!employee) return sendError(res, 'No employee profile is linked to your account yet.', 404);

  const targetDate = toUTCDate(new Date());
  const period = await getOrCreatePeriodForDate(orgId, targetDate);
  if (period.status === 'FINALIZED') {
    return sendError(res, "Today's attendance period is finalized; contact HR.", 409);
  }

  // Toggle CHECK_IN/CHECK_OUT off the raw event log, not the derived
  // Attendance.checkIn/checkOut (those only track the FIRST/last-CLOSED
  // session, so they stay truthy across a whole multi-punch day and can't
  // tell "is a session open right now"). Last event today was CHECK_IN ->
  // next is CHECK_OUT; anything else (CHECK_OUT, or no events yet) -> CHECK_IN.
  const { start: dayStart, end: dayEnd } = processor.dayBoundsUTC(targetDate);
  const lastEvent = await AttendanceEvent.findOne({
    organizationId: orgId, employeeId: employee._id, eventTimestamp: { $gte: dayStart, $lt: dayEnd },
  }).sort({ eventTimestamp: -1 });
  const eventType = lastEvent?.eventType === 'CHECK_IN' ? 'CHECK_OUT' : 'CHECK_IN';

  const { latitude, longitude } = req.body || {};
  const eventTimestamp = new Date();
  // Bucketed to a 3s window so an accidental double-tap/network-retry dedupes
  // (same key), while legitimately separate punches later in the day (always
  // >3s apart) each get their own key instead of colliding on eventType alone.
  const dedupeBucket = Math.floor(eventTimestamp.getTime() / 3000);
  const dedupeKey = `self:${employee._id}:${targetDate.toISOString().slice(0, 10)}:${eventType}:${dedupeBucket}`;

  try {
    await AttendanceEvent.create({
      organizationId: orgId, deviceId: null, deviceEmployeeRef: employee.employeeCode, employeeId: employee._id,
      eventType, rawEvent: { self_service: true, ...(latitude != null && longitude != null ? { latitude, longitude } : {}) },
      source: 'SELF_SERVICE', dedupeKey, eventTimestamp,
    });
  } catch (err) {
    if (err.code === 11000) return sendError(res, 'Already logged — please refresh.', 409);
    throw err;
  }

  const io = req.app.get('io');
  const updated = await processor.process(orgId, employee._id, targetDate, { io });

  sendSuccess(res, { attendance: updated, punched: eventType }, eventType === 'CHECK_IN' ? 'Checked in' : 'Checked out');
});

// --- GET /attendance/today ---
const SORT_FIELD_MAP = {
  employee_code: 'employeeCode',
  full_name: 'fullName',
  department_name: 'departmentName',
  designation_title: 'designationTitle',
  status: 'status',
  check_in: 'checkIn',
};

exports.listToday = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const targetDate = req.query.attendance_date ? toUTCDate(req.query.attendance_date) : toUTCDate(new Date());
  const { department_id: departmentId, status, search, sort } = req.query;
  const { page = 1, limit = 20 } = req.query;

  const employeeMatch = { organizationId: new mongoose.Types.ObjectId(orgId), deletedAt: null };
  if (departmentId) employeeMatch.departmentId = new mongoose.Types.ObjectId(departmentId);
  if (search) {
    const term = new RegExp(search.trim(), 'i');
    employeeMatch.$or = [{ fullName: term }, { employeeCode: term }];
  }

  const pipeline = [
    { $match: employeeMatch },
    {
      $lookup: {
        from: 'attendances',
        let: { empId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$employeeId', '$$empId'] }, { $eq: ['$attendanceDate', targetDate] }] } } },
        ],
        as: 'attendanceRows',
      },
    },
    { $unwind: { path: '$attendanceRows', preserveNullAndEmptyArrays: true } },
  ];
  if (status) pipeline.push({ $match: { 'attendanceRows.status': status } });
  pipeline.push(
    { $lookup: { from: 'departments', localField: 'departmentId', foreignField: '_id', as: 'departmentDoc' } },
    { $unwind: { path: '$departmentDoc', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'designations', localField: 'designationId', foreignField: '_id', as: 'designationDoc' } },
    { $unwind: { path: '$designationDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        employeeId: '$_id',
        employeeCode: 1,
        fullName: 1,
        departmentName: '$departmentDoc.name',
        designationTitle: '$designationDoc.title',
        status: '$attendanceRows.status',
        checkIn: '$attendanceRows.checkIn',
        checkOut: '$attendanceRows.checkOut',
        isCorrected: '$attendanceRows.isCorrected',
      },
    },
  );

  const sortField = SORT_FIELD_MAP[(sort || '').replace(/^-/, '')] || 'fullName';
  const descending = (sort || '').startsWith('-');
  pipeline.push(
    { $addFields: { _sortIsNull: { $eq: [{ $ifNull: [`$${sortField}`, null] }, null] } } },
    { $sort: { _sortIsNull: 1, [sortField]: descending ? -1 : 1 } },
    { $project: { _sortIsNull: 0 } },
  );

  const { skip, limit: lim } = paginate(page, limit);
  const [result] = await Employee.aggregate([
    ...pipeline,
    { $facet: { total: [{ $count: 'count' }], items: [{ $skip: skip }, { $limit: lim }] } },
  ]);
  const total = result.total[0]?.count || 0;
  sendSuccess(res, paginateResponse(result.items, total, page, limit));
});

// --- GET /attendance/exceptions ---
exports.listExceptions = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { page = 1, limit = 20 } = req.query;
  const q = { organizationId: orgId, employeeId: null };

  const total = await AttendanceEvent.countDocuments(q);
  const { skip, limit: lim } = paginate(page, limit);
  const rows = await AttendanceEvent.find(q).sort({ eventTimestamp: -1 }).skip(skip).limit(lim);
  sendSuccess(res, paginateResponse(rows, total, page, limit));
});

// --- GET /attendance/:employeeId ---
exports.getByEmployeeId = asyncHandler(async (req, res) => {
  const q = { organizationId: req.user.organizationId, employeeId: req.params.employeeId };
  if (req.query.date_from) q.attendanceDate = { ...q.attendanceDate, $gte: toUTCDate(req.query.date_from) };
  if (req.query.date_to) q.attendanceDate = { ...q.attendanceDate, $lte: toUTCDate(req.query.date_to) };

  const rows = await Attendance.find(q).sort({ attendanceDate: -1 });
  sendSuccess(res, { attendance: rows });
});

// --- POST /attendance/:attendanceId/correct ---
exports.requestCorrection = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { reason, check_in: checkInRaw, check_out: checkOutRaw } = req.body;
  if (!reason || reason.trim().length < 5) return sendError(res, 'reason must be at least 5 characters.', 422);
  const newCheckIn = checkInRaw ? new Date(checkInRaw) : null;
  const newCheckOut = checkOutRaw ? new Date(checkOutRaw) : null;
  if (!newCheckIn && !newCheckOut) {
    return sendError(res, 'Supply at least one of check_in/check_out.', 422);
  }

  const attendance = await Attendance.findOne({ _id: req.params.attendanceId, organizationId: orgId });
  if (!attendance) return sendError(res, 'Attendance record not found.', 404);

  const period = await AttendancePeriod.findOne({ _id: attendance.attendancePeriodId, organizationId: orgId });
  if (!period) return sendError(res, 'Attendance period not found.', 404);

  const employee = await Employee.findById(attendance.employeeId);

  if (period.status === 'FINALIZED') {
    const correction = await AttendanceCorrection.create({
      organizationId: orgId,
      attendanceId: attendance._id,
      requestedBy: req.user._id,
      reason,
      proposedCheckIn: newCheckIn,
      proposedCheckOut: newCheckOut,
    });
    await recordAuditEvent({
      organizationId: orgId,
      actorUserId: req.user._id,
      action: 'attendance.correct.request',
      entityType: 'Attendance',
      entityId: attendance._id,
      reason,
      newValue: { checkIn: newCheckIn, checkOut: newCheckOut },
    });
    return sendSuccess(res, { correction }, 'Correction request submitted for approval.');
  }

  // OPEN period — apply immediately via a synthetic event + full re-derivation.
  const previousValue = { checkIn: attendance.checkIn, checkOut: attendance.checkOut, status: attendance.status };

  if (newCheckIn) {
    await AttendanceEvent.create({
      organizationId: orgId, deviceId: null, deviceEmployeeRef: employee.employeeCode, employeeId: employee._id,
      eventType: 'CHECK_IN', rawEvent: { manual_correction: true, reason }, source: 'MANUAL_CORRECTION',
      dedupeKey: `correction:${new mongoose.Types.ObjectId()}`, eventTimestamp: newCheckIn,
    });
  }
  if (newCheckOut) {
    await AttendanceEvent.create({
      organizationId: orgId, deviceId: null, deviceEmployeeRef: employee.employeeCode, employeeId: employee._id,
      eventType: 'CHECK_OUT', rawEvent: { manual_correction: true, reason }, source: 'MANUAL_CORRECTION',
      dedupeKey: `correction:${new mongoose.Types.ObjectId()}`, eventTimestamp: newCheckOut,
    });
  }

  const io = req.app.get('io');
  const updated = await processor.process(orgId, attendance.employeeId, attendance.attendanceDate, { io });

  const newValue = { checkIn: updated.checkIn, checkOut: updated.checkOut, status: updated.status };
  updated.isCorrected = true;
  updated.correctionHistory.push({ actorUserId: req.user._id, reason, previousValue, newValue, appliedAt: new Date() });
  await updated.save();

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: req.user._id,
    action: 'attendance.correct',
    entityType: 'Attendance',
    entityId: attendance._id,
    reason,
    previousValue,
    newValue,
  });

  sendSuccess(res, { attendance: updated }, 'Correction applied.');
});

// --- POST /attendance/:attendanceId/correct/:correctionId/approve ---
exports.approveCorrection = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const correction = await AttendanceCorrection.findOne({
    _id: req.params.correctionId, attendanceId: req.params.attendanceId, organizationId: orgId,
  });
  if (!correction) return sendError(res, 'Attendance correction request not found.', 404);
  if (correction.status !== 'PENDING_APPROVAL') {
    return sendError(res, 'This correction is not pending approval.', 409);
  }
  if (String(correction.requestedBy) === String(req.user._id)) {
    return sendError(
      res,
      'A correction must be approved by a different SUPER_ADMIN than the one who requested it.',
      403,
    );
  }

  const attendance = await Attendance.findOne({ _id: correction.attendanceId, organizationId: orgId });
  if (!attendance) return sendError(res, 'Attendance record not found.', 404);
  const employee = await Employee.findById(attendance.employeeId);

  const previousValue = { checkIn: attendance.checkIn, checkOut: attendance.checkOut, status: attendance.status };

  if (correction.proposedCheckIn) {
    await AttendanceEvent.create({
      organizationId: orgId, deviceId: null, deviceEmployeeRef: employee.employeeCode, employeeId: employee._id,
      eventType: 'CHECK_IN', rawEvent: { manual_correction: true, reason: correction.reason }, source: 'MANUAL_CORRECTION',
      dedupeKey: `correction:${new mongoose.Types.ObjectId()}`, eventTimestamp: correction.proposedCheckIn,
    });
  }
  if (correction.proposedCheckOut) {
    await AttendanceEvent.create({
      organizationId: orgId, deviceId: null, deviceEmployeeRef: employee.employeeCode, employeeId: employee._id,
      eventType: 'CHECK_OUT', rawEvent: { manual_correction: true, reason: correction.reason }, source: 'MANUAL_CORRECTION',
      dedupeKey: `correction:${new mongoose.Types.ObjectId()}`, eventTimestamp: correction.proposedCheckOut,
    });
  }

  const io = req.app.get('io');
  const updated = await processor.process(orgId, attendance.employeeId, attendance.attendanceDate, { io });

  const newValue = { checkIn: updated.checkIn, checkOut: updated.checkOut, status: updated.status };
  updated.isCorrected = true;
  updated.correctionHistory.push({
    actorUserId: req.user._id, requestedBy: correction.requestedBy, reason: correction.reason, previousValue, newValue, appliedAt: new Date(),
  });
  await updated.save();

  correction.status = 'APPROVED';
  correction.approvedBy = req.user._id;
  correction.approvedAt = new Date();
  await correction.save();

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: req.user._id,
    action: 'attendance.correct.approve',
    entityType: 'Attendance',
    entityId: attendance._id,
    reason: correction.reason,
    previousValue,
    newValue,
  });

  sendSuccess(res, { attendance: updated }, 'Correction approved.');
});
