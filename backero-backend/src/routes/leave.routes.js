// Leave management routes, mounted at /api/leave. Literal paths (me/...)
// registered before /:employeeId-style params, same convention as
// attendance.routes.js.
const router = require('express').Router();
const leaveCtrl = require('../controllers/leave.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAttendancePermission } = require('../middleware/role.middleware');
const { ATTENDANCE_PERMISSIONS } = require('../utils/attendanceConstants');

router.use(authenticate);

const P = ATTENDANCE_PERMISSIONS;

router.get('/types', leaveCtrl.listTypes);
router.post('/types', requireAttendancePermission(P.LEAVE_MANAGE), leaveCtrl.createType);

router.get('/balances/me', leaveCtrl.getMyBalances);
router.get('/balances/:employeeId', requireAttendancePermission(P.LEAVE_READ), leaveCtrl.getEmployeeBalances);
router.put('/balances', requireAttendancePermission(P.LEAVE_MANAGE), leaveCtrl.setBalance);

router.get('/requests/me', leaveCtrl.getMyRequests);
router.get('/requests', requireAttendancePermission(P.LEAVE_APPROVE), leaveCtrl.listRequests);
router.post('/requests', leaveCtrl.apply);
router.post('/requests/:id/cancel', leaveCtrl.cancel);
router.post('/requests/:id/approve', requireAttendancePermission(P.LEAVE_APPROVE), leaveCtrl.approve);
router.post('/requests/:id/reject', requireAttendancePermission(P.LEAVE_APPROVE), leaveCtrl.reject);

module.exports = router;
