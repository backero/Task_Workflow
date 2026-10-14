// Admin attendance operations — ported from admin_router.py. `reprocess`
// is "the sanctioned alternative to manual DB surgery": for OPEN-period
// dates it directly re-derives and writes; for FINALIZED-period dates it
// only flags discrepancies via AttendanceCorrection, never overwrites.
const mongoose = require('mongoose');
const AttendanceEvent = require('../models/AttendanceEvent');
const Attendance = require('../models/Attendance');
const AttendanceCorrection = require('../models/AttendanceCorrection');
const { asyncHandler, sendSuccess } = require('../utils/helpers');
const { getOrCreatePeriodForDate } = require('../services/attendancePeriods.service');
const processor = require('../services/attendanceProcessor.service');
const { recordAuditEvent } = require('../services/attendanceAudit.service');

exports.reprocess = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { employee_id: employeeId, date_from: dateFrom, date_to: dateTo } = req.body;

  const rangeStart = new Date(dateFrom);
  const rangeStartUTC = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), rangeStart.getUTCDate()));
  const rangeEndDate = new Date(dateTo);
  const rangeEndUTC = new Date(Date.UTC(rangeEndDate.getUTCFullYear(), rangeEndDate.getUTCMonth(), rangeEndDate.getUTCDate() + 1));

  const match = { organizationId: new mongoose.Types.ObjectId(orgId), employeeId: { $ne: null }, eventTimestamp: { $gte: rangeStartUTC, $lt: rangeEndUTC } };
  if (employeeId) match.employeeId = new mongoose.Types.ObjectId(employeeId);

  const pairs = await AttendanceEvent.aggregate([
    { $match: match },
    {
      $project: {
        employeeId: 1,
        date: { $dateTrunc: { date: '$eventTimestamp', unit: 'day' } },
      },
    },
    { $group: { _id: { employeeId: '$employeeId', date: '$date' } } },
  ]);

  let processedCount = 0;
  let flaggedCount = 0;

  for (const { _id } of pairs) {
    const { employeeId: empId, date: targetDate } = _id;
    const period = await getOrCreatePeriodForDate(orgId, targetDate);

    if (period.status === 'FINALIZED') {
      const existing = await Attendance.findOne({ organizationId: orgId, employeeId: empId, attendanceDate: targetDate });
      const recomputed = await processor.preview(orgId, empId, targetDate);
      const differs = !existing
        || existing.status !== recomputed.status
        || (existing.checkIn?.getTime() || null) !== (recomputed.checkIn?.getTime() || null)
        || (existing.checkOut?.getTime() || null) !== (recomputed.checkOut?.getTime() || null);

      // Mirrors the source exactly: a differing FINALIZED date only gets
      // flagged if an Attendance row already exists to flag against — no
      // existing row + differing events is silently skipped, not created.
      if (differs && existing) {
        await AttendanceCorrection.create({
          organizationId: orgId,
          attendanceId: existing._id,
          requestedBy: req.user._id,
          reason: 'Reprocessing detected a discrepancy against event history.',
          proposedCheckIn: recomputed.checkIn,
          proposedCheckOut: recomputed.checkOut,
        });
        flaggedCount += 1;
      }
    } else {
      const io = req.app.get('io');
      await processor.process(orgId, empId, targetDate, { io });
      processedCount += 1;
    }
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: req.user._id,
    action: 'attendance.reprocess',
    entityType: 'Attendance',
    entityId: null,
    reason: `employee_id=${employeeId || ''}, date_from=${dateFrom}, date_to=${dateTo}`,
    newValue: { processedCount, flaggedForReviewCount: flaggedCount },
  });

  sendSuccess(res, { processedCount, flaggedForReviewCount: flaggedCount });
});
