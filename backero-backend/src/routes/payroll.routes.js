// Payroll routes — ported from the Attendance Tracker's
// app/modules/payroll/router.py, mounted at /api/payroll. Route order
// matters: /records/me (literal) must be registered before /records/:employeeId.
const router = require('express').Router();
const ctrl = require('../controllers/payroll.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAttendancePermission } = require('../middleware/role.middleware');
const { ATTENDANCE_PERMISSIONS } = require('../utils/attendanceConstants');

router.use(authenticate);

const P = ATTENDANCE_PERMISSIONS;

router.post('/periods', requireAttendancePermission(P.PAYROLL_MANAGE_CONFIG), ctrl.createPeriod);
router.get('/periods', requireAttendancePermission(P.PAYROLL_READ), ctrl.listPeriods);
router.post('/periods/:periodId/generate', requireAttendancePermission(P.PAYROLL_MANAGE_CONFIG), ctrl.generateRecords);
router.post('/periods/:periodId/finalize', requireAttendancePermission(P.PAYROLL_FINALIZE), ctrl.finalizePeriod);
router.get('/periods/:periodId/records', requireAttendancePermission(P.PAYROLL_READ), ctrl.getPeriodRecords);

router.get('/records/me', ctrl.getMyPayrollRecords);
router.get('/records/:employeeId', ctrl.getEmployeePayrollRecords);

router.get('/config/:employeeId', requireAttendancePermission(P.PAYROLL_MANAGE_CONFIG), ctrl.getPayrollConfig);
router.put('/config/:employeeId', requireAttendancePermission(P.PAYROLL_MANAGE_CONFIG), ctrl.setPayrollConfig);

router.post('/records/:recordId/correct', requireAttendancePermission(P.PAYROLL_MANAGE_CONFIG), ctrl.requestCorrection);
router.post(
  '/records/:recordId/correct/:correctionId/approve',
  requireAttendancePermission(P.PAYROLL_FINALIZE),
  ctrl.approveCorrection,
);

module.exports = router;
