// Attendance routes — ported from router.py + periods_router.py +
// admin_router.py, merged into one Express router mounted at /api/attendance.
// Route order matters: literal paths (me/today/exceptions/periods/admin/...)
// must be registered before the /:employeeId param route.
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const attendanceCtrl = require('../controllers/attendance.controller');
const periodsCtrl = require('../controllers/attendancePeriods.controller');
const adminCtrl = require('../controllers/attendanceAdmin.controller');
const auditCtrl = require('../controllers/attendanceAudit.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAttendancePermission } = require('../middleware/role.middleware');
const { ATTENDANCE_PERMISSIONS } = require('../utils/attendanceConstants');

router.use(authenticate);

const P = ATTENDANCE_PERMISSIONS;

const isDev = process.env.NODE_ENV !== 'production';
const noopMiddleware = (_req, _res, next) => next();
const punchLimiter = isDev ? noopMiddleware : rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attendance punches. Please slow down.' },
});

// --- Periods (mounted under /attendance/periods) ---
// period:read is granted to EVERY default role tier in the source (SUPER_ADMIN,
// HR, and EMPLOYEE all get it) — effectively "any authenticated user," so no
// extra permission gate beyond router.use(authenticate) above.
router.get('/periods/config', periodsCtrl.listConfigs);
router.post('/periods/config', requireAttendancePermission(P.PERIOD_CONFIGURE), periodsCtrl.createConfig);
router.get('/periods/current', periodsCtrl.getCurrent);
router.post('/periods/:periodId/finalize', requireAttendancePermission(P.PERIOD_FINALIZE), periodsCtrl.finalize);

// --- Admin ---
router.post('/admin/reprocess', requireAttendancePermission(P.ATTENDANCE_REPROCESS), adminCtrl.reprocess);

// --- Audit ---
router.get('/audit-logs', requireAttendancePermission(P.AUDIT_READ), auditCtrl.list);

// --- Self-service / exceptions / today ---
router.get('/me', attendanceCtrl.getMyAttendance);
router.post('/punch', punchLimiter, attendanceCtrl.punch);
router.get('/today', requireAttendancePermission(P.ATTENDANCE_READ), attendanceCtrl.listToday);
router.get('/exceptions', requireAttendancePermission(P.ATTENDANCE_REVIEW_EXCEPTIONS), attendanceCtrl.listExceptions);

// --- Per-employee + corrections ---
router.get('/:employeeId', requireAttendancePermission(P.ATTENDANCE_READ), attendanceCtrl.getByEmployeeId);
router.post('/:attendanceId/correct', requireAttendancePermission(P.ATTENDANCE_CORRECT), attendanceCtrl.requestCorrection);
router.post(
  '/:attendanceId/correct/:correctionId/approve',
  requireAttendancePermission(P.PERIOD_FINALIZE),
  attendanceCtrl.approveCorrection,
);

module.exports = router;
