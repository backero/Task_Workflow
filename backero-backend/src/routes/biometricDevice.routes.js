// Biometric device routes — ported from the Attendance Tracker's
// app/modules/biometric/router.py, mounted at /api/devices.
const router = require('express').Router();
const ctrl = require('../controllers/biometricDevice.controller');
const upload = require('../middleware/upload.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAttendancePermission } = require('../middleware/role.middleware');
const { ATTENDANCE_PERMISSIONS } = require('../utils/attendanceConstants');

router.use(authenticate);

const P = ATTENDANCE_PERMISSIONS;

router.get('', requireAttendancePermission(P.DEVICE_READ), ctrl.list);
router.post('', requireAttendancePermission(P.DEVICE_MANAGE), ctrl.create);
router.post('/:deviceId/sync', requireAttendancePermission(P.DEVICE_MANAGE), ctrl.sync);
router.put('/:deviceId/import-config', requireAttendancePermission(P.DEVICE_MANAGE), ctrl.setImportConfig);
router.post('/:deviceId/import', requireAttendancePermission(P.DEVICE_MANAGE), upload.single('file'), ctrl.importFile);

module.exports = router;
