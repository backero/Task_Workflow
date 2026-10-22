// Employee + Designation routes — ported from the Attendance Tracker's
// /employees and /designations endpoints. `/me` routes are self-scoped (any
// authenticated user); `/{id}` is ownership-or-permission gated inline in
// the controller (see employee.controller.js#getById); list/create/update
// require the employee:* permission via requireAttendancePermission.
const router = require('express').Router();
const multer = require('multer');
const employeeCtrl = require('../controllers/employee.controller');
const designationCtrl = require('../controllers/designation.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAttendancePermission } = require('../middleware/role.middleware');
const { ATTENDANCE_PERMISSIONS } = require('../utils/attendanceConstants');

const photoUpload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

router.use(authenticate);

router.get('/designations', designationCtrl.list);
router.post('/designations', requireAttendancePermission(ATTENDANCE_PERMISSIONS.DEPARTMENT_MANAGE), designationCtrl.create);

router.get('/me', employeeCtrl.getMyProfile);
router.patch('/me', employeeCtrl.updateMyProfile);
router.post('/me/photo', photoUpload.single('photo'), employeeCtrl.updateMyPhoto);

router.get('', requireAttendancePermission(ATTENDANCE_PERMISSIONS.EMPLOYEE_READ), employeeCtrl.list);
router.post('', requireAttendancePermission(ATTENDANCE_PERMISSIONS.EMPLOYEE_MANAGE), employeeCtrl.create);
router.get('/:id', employeeCtrl.getById);
router.patch('/:id', requireAttendancePermission(ATTENDANCE_PERMISSIONS.EMPLOYEE_MANAGE), employeeCtrl.update);
router.post('/:id/photo', requireAttendancePermission(ATTENDANCE_PERMISSIONS.EMPLOYEE_MANAGE), photoUpload.single('photo'), employeeCtrl.updateEmployeePhoto);

module.exports = router;
