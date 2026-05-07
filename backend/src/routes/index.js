const express = require('express');
const router = express.Router();

const authRoutes         = require('./auth.routes');
const orgRoutes          = require('./org.routes');
const projectRoutes      = require('./project.routes');
const taskRoutes         = require('./task.routes');
const notificationRoutes = require('./notification.routes');
const userRoutes         = require('./user.routes');
const analyticsRoutes    = require('./analytics.routes');
const dashboardRoutes    = require('./dashboard.routes');
const employeeRoutes     = require('./employee.routes');
const inventoryRoutes    = require('./inventory.routes');
const financeRoutes      = require('./finance.routes');
const searchRoutes       = require('./search.routes');
const labelRoutes        = require('./label.routes');
const timeLogRoutes      = require('./timeLog.routes');
const exportRoutes       = require('./export.routes');
const reportsRoutes      = require('./reports.routes');
const importRoutes       = require('./import.routes');
const uploadRoutes       = require('./upload.routes');
const productionRoutes   = require('./production.routes');

router.use('/auth',          authRoutes);
router.use('/org',           orgRoutes);
router.use('/projects',      projectRoutes);
router.use('/tasks',         taskRoutes);
router.use('/notifications', notificationRoutes);
router.use('/users',         userRoutes);
router.use('/analytics',     analyticsRoutes);
router.use('/dashboard',     dashboardRoutes);
router.use('/employees',     employeeRoutes);
router.use('/inventory',     inventoryRoutes);
router.use('/finance',       financeRoutes);
router.use('/search',        searchRoutes);
router.use('/labels',        labelRoutes);
router.use('/time-logs',     timeLogRoutes);
router.use('/export',        exportRoutes);
router.use('/reports',       reportsRoutes);
router.use('/import',        importRoutes);
router.use('/upload',        uploadRoutes);
router.use('/production',    productionRoutes);

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Backero API is running', timestamp: new Date().toISOString() });
});

module.exports = router;
