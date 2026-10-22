const router = require('express').Router();
const punchCtrl = require('../controllers/attendance.punch.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

// Punch system endpoints
router.post('/punch', punchCtrl.recordPunch);
router.get('/punch/today', punchCtrl.getTodayPunchStatus);
router.get('/punch/history', punchCtrl.getPunchHistory);

module.exports = router;
