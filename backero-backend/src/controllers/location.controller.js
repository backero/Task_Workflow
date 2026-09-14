// Field location endpoints — ported from the Attendance Tracker's
// app/modules/location/router.py. `/locations/sessions/*` and
// `/locations/batch` are self-scoped (the caller acts on their own linked
// Employee, never a client-supplied employee_id); `/locations/live` and
// `/locations/sessions/:id/history` are the HR/Admin surface.
const Employee = require('../models/Employee');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const locationService = require('../services/location.service');

async function currentEmployeeOr404(req) {
  const employee = await Employee.findOne({ organizationId: req.user.organizationId, userId: req.user._id, deletedAt: null });
  if (!employee) {
    const err = new Error('No employee profile is linked to your account yet.');
    err.statusCode = 404;
    throw err;
  }
  return employee;
}

exports.startSession = asyncHandler(async (req, res) => {
  const employee = await currentEmployeeOr404(req);
  const { session, intervalSeconds } = await locationService.startSession(req.user.organizationId, employee);
  sendSuccess(
    res,
    { session: { id: session._id, employeeId: session.employeeId, startedAt: session.startedAt, locationIntervalSeconds: intervalSeconds } },
    'Session started',
    201,
  );
});

exports.endSession = asyncHandler(async (req, res) => {
  const employee = await currentEmployeeOr404(req);
  const { reason } = req.body;
  if (!reason) return sendError(res, 'reason is required.', 422);
  const session = await locationService.endSession(req.user.organizationId, {
    sessionId: req.params.sessionId, employeeId: employee._id, isAdmin: false, reason,
  });
  sendSuccess(res, { session });
});

exports.batchUpload = asyncHandler(async (req, res) => {
  const employee = await currentEmployeeOr404(req);
  const { session_id: sessionId, points } = req.body;
  if (!sessionId || !Array.isArray(points) || !points.length) {
    return sendError(res, 'session_id and a non-empty points array are required.', 422);
  }
  const normalizedPoints = points.map((p) => ({
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    accuracyMeters: p.accuracy_meters != null ? Number(p.accuracy_meters) : null,
    deviceInfo: p.device_info || null,
    clientPointId: p.client_point_id,
    recordedAt: new Date(p.recorded_at),
  }));
  const { accepted, duplicates } = await locationService.ingestBatch(req.user.organizationId, {
    employee, sessionId, points: normalizedPoints,
  });
  sendSuccess(res, { accepted_count: accepted, duplicate_count: duplicates });
});

exports.liveLocations = asyncHandler(async (req, res) => {
  const rows = await locationService.listLiveLocations(req.user.organizationId);
  sendSuccess(res, { locations: rows });
});

exports.sessionHistory = asyncHandler(async (req, res) => {
  const rows = await locationService.getSessionHistory(req.user.organizationId, req.params.sessionId);
  sendSuccess(res, { history: rows });
});
