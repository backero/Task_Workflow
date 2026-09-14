// Location routes — ported from the Attendance Tracker's
// app/modules/location/router.py, mounted at /api/locations.
// field_session:start is an EMPLOYEE-tier default permission (every
// authenticated user has it in the source) — no extra gate beyond
// authenticate; the real business gate is employee.category === 'FIELD',
// enforced in the service layer.
const router = require('express').Router();
const ctrl = require('../controllers/location.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAttendancePermission } = require('../middleware/role.middleware');
const { ATTENDANCE_PERMISSIONS } = require('../utils/attendanceConstants');

router.use(authenticate);

const P = ATTENDANCE_PERMISSIONS;

router.post('/sessions/start', ctrl.startSession);
router.post('/sessions/:sessionId/end', ctrl.endSession);
router.post('/batch', ctrl.batchUpload);
router.get('/live', requireAttendancePermission(P.LOCATION_VIEW_LIVE), ctrl.liveLocations);
router.get('/sessions/:sessionId/history', requireAttendancePermission(P.LOCATION_VIEW_HISTORY), ctrl.sessionHistory);

module.exports = router;
