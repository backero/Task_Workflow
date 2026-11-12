// Admin-facing Attendance Tracker surface — periods, rules, holidays,
// work-schedule, reprocess, and audit log controllers already existed but
// were never mounted anywhere; attendanceBoard.controller.js fills the
// today's-board/history/correction/exceptions pieces that didn't exist at
// all. Mounted at /api/attendance alongside attendance.routes.js (legacy
// check-in/out) and attendance.punch.routes.js (the live self-service
// punch widget) — no path collisions, but the literal paths below (today,
// me, rules, holidays, exceptions, admin/*, periods/*, audit-logs) MUST be
// registered before the generic /:employeeId and /:attendanceId/correct*
// routes, or Express would match e.g. "today" as an :employeeId value.
const router = require('express').Router();
const boardCtrl = require('../controllers/attendanceBoard.controller');
const periodsCtrl = require('../controllers/attendancePeriods.controller');
const rulesCtrl = require('../controllers/attendanceStatusRules.controller');
const holidayCtrl = require('../controllers/holiday.controller');
const workScheduleCtrl = require('../controllers/workSchedule.controller');
const adminCtrl = require('../controllers/attendanceAdmin.controller');
const auditCtrl = require('../controllers/attendanceAudit.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAttendancePermission } = require('../middleware/role.middleware');
const { ATTENDANCE_PERMISSIONS } = require('../utils/attendanceConstants');

router.use(authenticate);

const P = ATTENDANCE_PERMISSIONS;

router.get('/today', requireAttendancePermission(P.ATTENDANCE_READ), boardCtrl.getToday);
router.get('/me', boardCtrl.getMe);
router.get('/exceptions', requireAttendancePermission(P.ATTENDANCE_REVIEW_EXCEPTIONS), boardCtrl.getExceptions);
router.get('/audit-logs', requireAttendancePermission(P.AUDIT_READ), auditCtrl.list);

router.get('/periods/current', requireAttendancePermission(P.PERIOD_READ), periodsCtrl.getCurrent);
router.get('/periods/config', requireAttendancePermission(P.PERIOD_READ), periodsCtrl.listConfigs);
router.post('/periods/config', requireAttendancePermission(P.PERIOD_CONFIGURE), periodsCtrl.createConfig);
router.post('/periods/:periodId/finalize', requireAttendancePermission(P.PERIOD_FINALIZE), periodsCtrl.finalize);

router.get('/rules', requireAttendancePermission(P.ATTENDANCE_READ), rulesCtrl.list);
router.post('/rules', requireAttendancePermission(P.RULES_CONFIGURE), rulesCtrl.create);

router.get('/holidays', requireAttendancePermission(P.ATTENDANCE_READ), holidayCtrl.list);
router.post('/holidays', requireAttendancePermission(P.RULES_CONFIGURE), holidayCtrl.create);
router.delete('/holidays/:id', requireAttendancePermission(P.RULES_CONFIGURE), holidayCtrl.remove);

router.get('/work-schedule', requireAttendancePermission(P.ATTENDANCE_READ), workScheduleCtrl.list);
router.post('/work-schedule', requireAttendancePermission(P.RULES_CONFIGURE), workScheduleCtrl.create);

router.post('/admin/reprocess', requireAttendancePermission(P.ATTENDANCE_REPROCESS), adminCtrl.reprocess);

// Generic params last — see header comment on ordering.
router.get('/:employeeId', requireAttendancePermission(P.ATTENDANCE_READ), boardCtrl.getEmployeeHistory);
router.post('/:attendanceId/correct', requireAttendancePermission(P.ATTENDANCE_CORRECT), boardCtrl.requestCorrection);
router.post(
  '/:attendanceId/correct/:correctionId/approve',
  requireAttendancePermission(P.PERIOD_FINALIZE),
  boardCtrl.approveCorrection,
);

module.exports = router;
