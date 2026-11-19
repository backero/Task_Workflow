const router = require('express').Router();
const ctrl = require('../controllers/employeeAdvance.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAttendancePermission } = require('../middleware/role.middleware');
const { ATTENDANCE_PERMISSIONS: P } = require('../utils/attendanceConstants');

router.use(authenticate);
router.post('/me', ctrl.request);
router.get('/me', ctrl.myRequests);
router.get('/', requireAttendancePermission(P.PAYROLL_READ), ctrl.list);
router.post('/:advanceId/decision', requireAttendancePermission(P.PAYROLL_MANAGE_CONFIG), ctrl.decide);
module.exports = router;
