const express = require('express');
const router  = express.Router();
const { authenticate }  = require('../middleware/auth.middleware');
const {
  getTaskReport, getEmployeeReport, getInventoryReport, getFinanceReport,
  exportReportPDF, exportReportExcel,
} = require('../controllers/reports.controller');

router.use(authenticate);

router.get('/tasks',     getTaskReport);
router.get('/employees', getEmployeeReport);
router.get('/inventory', getInventoryReport);
router.get('/finance',   getFinanceReport);

router.get('/export/:type/pdf',   exportReportPDF);
router.get('/export/:type/excel', exportReportExcel);

module.exports = router;
