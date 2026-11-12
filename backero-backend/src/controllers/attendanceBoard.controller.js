// Today's Board, employee attendance history, attendance corrections, and
// unmatched-punch exceptions — the admin-facing surface of the ported
// Attendance Tracker that was missing a controller entirely (periods,
// rules, holidays, work-schedule, reprocess, and audit already existed in
// their own controllers; only this piece was never written).
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const AttendanceEvent = require('../models/AttendanceEvent');
const AttendanceCorrection = require('../models/AttendanceCorrection');
const AttendancePeriod = require('../models/AttendancePeriod');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const processor = require('../services/attendanceProcessor.service');
const { recordAuditEvent } = require('../services/attendanceAudit.service');

function parseDateOnly(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Every employee for the org, left-joined to their Attendance row for the
 * given date — an employee with no row yet shows status: null, which the
 * frontend renders as "NO RECORD" (not a bug: nothing has derived their
 * day yet, same as a device-tracker employee who hasn't punched). */
exports.getToday = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { attendance_date: dateStr, search, department_id: departmentId, status } = req.query;
  const { page = 1, limit = 20 } = req.query;
  const targetDate = parseDateOnly(dateStr);

  const empQuery = { organizationId: orgId, deletedAt: null };
  if (departmentId) empQuery.departmentId = departmentId;
  if (search) empQuery.$or = [{ fullName: new RegExp(search, 'i') }, { employeeCode: new RegExp(search, 'i') }];

  const employees = await Employee.find(empQuery).populate('departmentId', 'name').sort({ fullName: 1 });
  const attendanceRows = await Attendance.find({
    organizationId: orgId, attendanceDate: targetDate, employeeId: { $in: employees.map((e) => e._id) },
  });
  const attByEmployeeId = new Map(attendanceRows.map((a) => [String(a.employeeId), a]));

  let rows = employees.map((e) => {
    const att = attByEmployeeId.get(String(e._id));
    return {
      employeeId: e._id, employeeCode: e.employeeCode, fullName: e.fullName,
      departmentName: e.departmentId?.name || null,
      status: att?.status || null, checkIn: att?.checkIn || null, checkOut: att?.checkOut || null,
      isCorrected: att?.isCorrected || false, attendanceId: att?._id || null,
    };
  });
  if (status) rows = rows.filter((r) => r.status === status);

  const total = rows.length;
  const { skip, limit: lim } = paginate(page, limit);
  sendSuccess(res, paginateResponse(rows.slice(skip, skip + lim), total, page, limit));
});

exports.getEmployeeHistory = asyncHandler(async (req, res) => {
  const { limit = 30 } = req.query;
  const rows = await Attendance.find({ organizationId: req.user.organizationId, employeeId: req.params.employeeId })
    .sort({ attendanceDate: -1 }).limit(Number(limit));
  sendSuccess(res, { attendance: rows });
});

exports.getMe = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ organizationId: req.user.organizationId, userId: req.user._id, deletedAt: null });
  if (!employee) return sendError(res, 'No employee profile is linked to your account yet.', 404);
  const { limit = 30 } = req.query;
  const rows = await Attendance.find({ organizationId: req.user.organizationId, employeeId: employee._id })
    .sort({ attendanceDate: -1 }).limit(Number(limit));
  sendSuccess(res, { attendance: rows });
});

/** Mirrors the AttendanceCorrection model's own doc comment: a correction
 * against an OPEN period's day applies immediately (new MANUAL_CORRECTION
 * events + re-derive) since nothing is locked yet; a FINALIZED day instead
 * creates a pending AttendanceCorrection for dual-approval, exactly like
 * payroll.service.js's correction flow. */
exports.requestCorrection = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { reason, check_in: checkInStr, check_out: checkOutStr } = req.body;
  if (!reason || reason.trim().length < 5) return sendError(res, 'reason must be at least 5 characters.', 422);
  if (!checkInStr && !checkOutStr) return sendError(res, 'check_in or check_out is required.', 422);

  const attendance = await Attendance.findOne({ _id: req.params.attendanceId, organizationId: orgId });
  if (!attendance) return sendError(res, 'Attendance record not found.', 404);

  const proposedCheckIn = checkInStr ? new Date(checkInStr) : attendance.checkIn;
  const proposedCheckOut = checkOutStr ? new Date(checkOutStr) : attendance.checkOut;

  const period = await AttendancePeriod.findById(attendance.attendancePeriodId);
  if (period?.status === 'FINALIZED') {
    const correction = await AttendanceCorrection.create({
      organizationId: orgId, attendanceId: attendance._id, requestedBy: req.user._id, reason,
      proposedCheckIn, proposedCheckOut,
    });
    await recordAuditEvent({
      organizationId: orgId, actorUserId: req.user._id, action: 'attendance.correct.request',
      entityType: 'Attendance', entityId: attendance._id, reason, newValue: { proposedCheckIn, proposedCheckOut },
    });
    return sendSuccess(res, { correction }, 'Correction submitted for approval (period is finalized).');
  }

  // OPEN period — apply directly. AttendanceEvent is append-only (never
  // edited), so a correction is a NEW event pair, same convention the
  // model's own header comment documents for every other correction path.
  const employee = await Employee.findById(attendance.employeeId);
  const previousValue = { checkIn: attendance.checkIn, checkOut: attendance.checkOut, status: attendance.status };

  if (checkInStr) {
    await AttendanceEvent.create({
      organizationId: orgId, deviceEmployeeRef: employee.employeeCode, employeeId: employee._id,
      eventType: 'CHECK_IN', rawEvent: { manual: true, reason }, source: 'MANUAL_CORRECTION',
      dedupeKey: `manual:${attendance._id}:checkin:${proposedCheckIn.toISOString()}`, eventTimestamp: proposedCheckIn,
    });
  }
  if (checkOutStr) {
    await AttendanceEvent.create({
      organizationId: orgId, deviceEmployeeRef: employee.employeeCode, employeeId: employee._id,
      eventType: 'CHECK_OUT', rawEvent: { manual: true, reason }, source: 'MANUAL_CORRECTION',
      dedupeKey: `manual:${attendance._id}:checkout:${proposedCheckOut.toISOString()}`, eventTimestamp: proposedCheckOut,
    });
  }

  const io = req.app.get('io');
  const updated = await processor.process(orgId, attendance.employeeId, attendance.attendanceDate, { io });
  updated.isCorrected = true;
  updated.correctionHistory.push({
    actorUserId: req.user._id, requestedBy: req.user._id, reason, previousValue,
    newValue: { checkIn: updated.checkIn, checkOut: updated.checkOut, status: updated.status },
  });
  await updated.save();

  await recordAuditEvent({
    organizationId: orgId, actorUserId: req.user._id, action: 'attendance.correct.apply',
    entityType: 'Attendance', entityId: attendance._id, reason, previousValue,
    newValue: { checkIn: updated.checkIn, checkOut: updated.checkOut, status: updated.status },
  });
  sendSuccess(res, { attendance: updated }, 'Correction applied.');
});

exports.approveCorrection = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const correction = await AttendanceCorrection.findOne({ _id: req.params.correctionId, organizationId: orgId });
  if (!correction || String(correction.attendanceId) !== String(req.params.attendanceId)) {
    return sendError(res, 'Attendance correction request not found.', 404);
  }
  if (correction.status !== 'PENDING_APPROVAL') return sendError(res, 'This correction is not pending approval.', 409);
  if (String(correction.requestedBy) === String(req.user._id)) {
    return sendError(res, 'A correction must be approved by a different admin than the one who requested it.', 403);
  }

  const attendance = await Attendance.findOne({ _id: correction.attendanceId, organizationId: orgId });
  if (!attendance) return sendError(res, 'Attendance record not found.', 404);

  const previousValue = { checkIn: attendance.checkIn, checkOut: attendance.checkOut, status: attendance.status };
  if (correction.proposedCheckIn) attendance.checkIn = correction.proposedCheckIn;
  if (correction.proposedCheckOut) attendance.checkOut = correction.proposedCheckOut;
  attendance.isCorrected = true;
  attendance.correctionHistory.push({
    actorUserId: req.user._id, requestedBy: correction.requestedBy, reason: correction.reason,
    previousValue, newValue: { checkIn: attendance.checkIn, checkOut: attendance.checkOut, status: attendance.status },
  });
  await attendance.save();

  correction.status = 'APPROVED';
  correction.approvedBy = req.user._id;
  correction.approvedAt = new Date();
  await correction.save();

  await recordAuditEvent({
    organizationId: orgId, actorUserId: req.user._id, action: 'attendance.correct.approve',
    entityType: 'Attendance', entityId: attendance._id, reason: correction.reason, previousValue,
    newValue: { checkIn: attendance.checkIn, checkOut: attendance.checkOut, status: attendance.status },
  });
  sendSuccess(res, { attendance }, 'Correction approved.');
});

/** Unmatched device/import events — deviceEmployeeRef didn't resolve to any
 * known employeeCode. These are the rows a CSV/device sync couldn't place. */
exports.getExceptions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const q = { organizationId: req.user.organizationId, employeeId: null };
  const total = await AttendanceEvent.countDocuments(q);
  const { skip, limit: lim } = paginate(page, limit);
  const rows = await AttendanceEvent.find(q).sort({ eventTimestamp: -1 }).skip(skip).limit(lim);
  sendSuccess(res, paginateResponse(rows, total, page, limit));
});
