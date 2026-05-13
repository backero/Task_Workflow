const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { getDashboardOverview, getWeeklyTaskData, getEmployeePerformance } = require('../controllers/dashboard.controller');

router.use(authenticate);
router.get('/overview',              getDashboardOverview);
router.get('/weekly-tasks',          getWeeklyTaskData);
router.get('/employee-performance',  getEmployeePerformance);

module.exports = router;
