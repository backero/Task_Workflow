const express = require('express');
const router = express.Router();
const { getOverview, getTaskAnalytics, getProjectAnalytics, getActivity } = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/overview',  getOverview);
router.get('/tasks',     getTaskAnalytics);
router.get('/projects',  getProjectAnalytics);
router.get('/activity',  getActivity);

module.exports = router;
