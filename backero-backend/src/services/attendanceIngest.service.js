// Event ingestion — the write path that feeds AttendanceEvent -> processor
// -> Attendance. Ported from service.py#ingest_event. Not its own HTTP
// route (the source's own ingestion endpoint lives in a device-sync/webhook
// router not read for this port) — called by the Biometric Devices domain
// (device sync + CSV import) once that lands.
const AttendanceEvent = require('../models/AttendanceEvent');
const Employee = require('../models/Employee');
const { getOrCreatePeriodForDate } = require('./attendancePeriods.service');
const processor = require('./attendanceProcessor.service');

/**
 * @returns {Promise<{event, wasNewlyInserted: boolean}>}
 */
async function ingestEvent(organizationId, { deviceId = null, deviceEmployeeRef, eventType, rawEvent, source, dedupeKey, eventTimestamp }, { io } = {}) {
  const employee = await Employee.findOne({ organizationId, employeeCode: deviceEmployeeRef, deletedAt: null });
  const employeeId = employee ? employee._id : null;

  // Idempotent insert — if dedupeKey already exists for this org, return the
  // existing row untouched (AttendanceEvent is immutable/append-only).
  const existing = await AttendanceEvent.findOne({ organizationId, dedupeKey });
  if (existing) return { event: existing, wasNewlyInserted: false };

  let event;
  try {
    event = await AttendanceEvent.create({
      organizationId, deviceId, deviceEmployeeRef, employeeId, eventType, rawEvent, source, dedupeKey, eventTimestamp,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Lost a race to a concurrent insert with the same dedupeKey.
      const winner = await AttendanceEvent.findOne({ organizationId, dedupeKey });
      return { event: winner, wasNewlyInserted: false };
    }
    throw err;
  }

  if (employeeId) {
    const targetDate = new Date(Date.UTC(
      eventTimestamp.getUTCFullYear(), eventTimestamp.getUTCMonth(), eventTimestamp.getUTCDate(),
    ));
    const period = await getOrCreatePeriodForDate(organizationId, targetDate);
    // Only re-derive live if the covering period isn't FINALIZED — a
    // finalized period requires the correction/reprocess workflow instead.
    if (period.status !== 'FINALIZED') {
      await processor.process(organizationId, employeeId, targetDate, { io });
    }
  }

  return { event, wasNewlyInserted: true };
}

module.exports = { ingestEvent };
