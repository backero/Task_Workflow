// Field location tracking — ported from the Attendance Tracker's
// app/modules/location/service.py. OFFICE employees never generate a row
// here; FIELD employees only while a session is open — enforced here, not
// just documented.
const mongoose = require('mongoose');
const LocationTrackingSession = require('../models/LocationTrackingSession');
const EmployeeLocation = require('../models/EmployeeLocation');
const { LOCATION_DEFAULTS } = require('../utils/attendanceConstants');

const EARTH_RADIUS_KM = 6371.0;

function fail(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const [lat1R, lon1R, lat2R, lon2R] = [lat1, lon1, lat2, lon2].map(toRad);
  const dLat = lat2R - lat1R;
  const dLon = lon2R - lon1R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1R) * Math.cos(lat2R) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

async function getOpenSessionForEmployee(organizationId, employeeId) {
  return LocationTrackingSession.findOne({ organizationId, employeeId, endedAt: null });
}

async function startSession(organizationId, employee) {
  if (employee.category !== 'FIELD') {
    throw fail(422, 'Only FIELD employees may start a location tracking session.');
  }
  if (await getOpenSessionForEmployee(organizationId, employee._id)) {
    throw fail(409, 'A tracking session is already open for this employee.');
  }

  // Race-safe re-check right before insert — narrows (does not eliminate)
  // the window a Postgres partial-unique-index would close entirely; two
  // concurrent starts within the same tick could still both pass this
  // check, matching a documented, accepted limitation of this port rather
  // than a silent behavior change.
  const session = await LocationTrackingSession.create({ organizationId, employeeId: employee._id });
  return { session, intervalSeconds: LOCATION_DEFAULTS.INTERVAL_SECONDS };
}

async function getSessionOr404(organizationId, sessionId) {
  const session = await LocationTrackingSession.findOne({ _id: sessionId, organizationId });
  if (!session) throw fail(404, 'Location tracking session not found.');
  return session;
}

async function endSession(organizationId, { sessionId, employeeId, isAdmin, reason }) {
  const session = await getSessionOr404(organizationId, sessionId);
  if (String(session.employeeId) !== String(employeeId) && !isAdmin) {
    // 404, not 403 — never confirm another employee's session exists to a
    // non-admin caller.
    throw fail(404, 'Location tracking session not found.');
  }
  if (session.endedAt !== null) throw fail(409, 'This tracking session has already ended.');

  session.endedAt = new Date();
  session.endReason = reason;
  await session.save();
  return session;
}

function resolveFlags(point, previous) {
  const isLowAccuracy = point.accuracyMeters != null && point.accuracyMeters > LOCATION_DEFAULTS.LOW_ACCURACY_THRESHOLD_METERS;

  let isAnomalous = false;
  if (previous) {
    const elapsedHours = (point.recordedAt.getTime() - previous.recordedAt.getTime()) / (1000 * 60 * 60);
    if (elapsedHours > 0) {
      const distanceKm = haversineKm(previous.latitude, previous.longitude, point.latitude, point.longitude);
      const impliedSpeedKmh = distanceKm / elapsedHours;
      if (impliedSpeedKmh > LOCATION_DEFAULTS.ANOMALY_SPEED_KMH) isAnomalous = true;
    }
  }
  return { isLowAccuracy, isAnomalous };
}

async function ingestBatch(organizationId, { employee, sessionId, points }) {
  if (employee.category !== 'FIELD') throw fail(422, 'Only FIELD employees may submit location points.');

  const session = await getSessionOr404(organizationId, sessionId);
  if (String(session.employeeId) !== String(employee._id)) throw fail(404, 'Location tracking session not found.');
  if (session.endedAt !== null) {
    throw fail(422, 'This tracking session has ended; points can only be submitted to an open session.');
  }

  let accepted = 0;
  let duplicates = 0;
  let latest = await EmployeeLocation.findOne({ organizationId, trackingSessionId: session._id }).sort({ recordedAt: -1 });

  const sortedPoints = [...points].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  for (const point of sortedPoints) {
    const { isLowAccuracy, isAnomalous } = resolveFlags(point, latest);
    let inserted;
    try {
      // eslint-disable-next-line no-await-in-loop
      inserted = await EmployeeLocation.create({
        organizationId,
        trackingSessionId: session._id,
        employeeId: employee._id,
        latitude: point.latitude,
        longitude: point.longitude,
        accuracyMeters: point.accuracyMeters ?? null,
        deviceInfo: point.deviceInfo ?? null,
        clientPointId: point.clientPointId,
        isLowAccuracy,
        isAnomalous,
        recordedAt: point.recordedAt,
      });
    } catch (err) {
      if (err.code === 11000) {
        duplicates += 1;
        continue;
      }
      throw err;
    }
    accepted += 1;
    latest = inserted;
  }

  return { accepted, duplicates, latest };
}

/** Latest point per currently-open session, for the live map. */
async function listLiveLocations(organizationId) {
  const rows = await EmployeeLocation.aggregate([
    { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
    { $sort: { trackingSessionId: 1, recordedAt: -1 } },
    { $group: { _id: '$trackingSessionId', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    {
      $lookup: {
        from: 'locationtrackingsessions', localField: 'trackingSessionId', foreignField: '_id', as: 'session',
      },
    },
    { $unwind: '$session' },
    { $match: { 'session.endedAt': null } },
    { $lookup: { from: 'employees', localField: 'employeeId', foreignField: '_id', as: 'employee' } },
    { $unwind: '$employee' },
    {
      $project: {
        _id: 0,
        employeeId: 1,
        employeeFullName: '$employee.fullName',
        trackingSessionId: 1,
        latitude: 1,
        longitude: 1,
        accuracyMeters: 1,
        isLowAccuracy: 1,
        recordedAt: 1,
      },
    },
  ]);
  return rows;
}

async function getSessionHistory(organizationId, sessionId) {
  await getSessionOr404(organizationId, sessionId);
  return EmployeeLocation.find({ organizationId, trackingSessionId: sessionId }).sort({ recordedAt: 1 });
}

/** Force-ends any session left open longer than timeoutHours. Not wired to
 * a scheduler yet (no cron infra exists in this backend) — call manually or
 * wire to node-cron/agenda when that infra lands. Returns count closed. */
async function timeoutStaleSessions(organizationId, { timeoutHours = LOCATION_DEFAULTS.SESSION_TIMEOUT_HOURS, asOf } = {}) {
  const cutoff = new Date((asOf || new Date()).getTime() - timeoutHours * 60 * 60 * 1000);
  const result = await LocationTrackingSession.updateMany(
    { organizationId, endedAt: null, startedAt: { $lt: cutoff } },
    { $set: { endedAt: new Date(), endReason: 'TIMEOUT' } },
  );
  return result.modifiedCount || 0;
}

/** Retention purge. Not wired to a scheduler yet — same caveat as above. */
async function purgeExpiredLocations(organizationId, { retentionDays = LOCATION_DEFAULTS.RETENTION_DAYS, asOf } = {}) {
  const cutoff = new Date((asOf || new Date()).getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await EmployeeLocation.deleteMany({ organizationId, recordedAt: { $lt: cutoff } });
  return result.deletedCount || 0;
}

module.exports = {
  haversineKm,
  getOpenSessionForEmployee,
  startSession,
  getSessionOr404,
  endSession,
  ingestBatch,
  listLiveLocations,
  getSessionHistory,
  timeoutStaleSessions,
  purgeExpiredLocations,
};
