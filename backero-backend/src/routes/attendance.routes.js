const router = require('express').Router();
const attendanceCtrl = require('../controllers/attendance.controller');
const { authenticate } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authenticate);

// Check-in/Check-out
router.post('/check-in', attendanceCtrl.checkIn);
router.post('/check-out', attendanceCtrl.checkOut);

// Get today's status
router.get('/today-status', attendanceCtrl.getTodayStatus);

// Get attendance history (last 30 days by default)
router.get('/history', attendanceCtrl.getAttendanceHistory);

// Get attendance analytics for a month
router.get('/analytics', attendanceCtrl.getAttendanceAnalytics);

module.exports = router;
