const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const { authenticate }   = require('../middleware/auth.middleware');
const { requireMinRole } = require('../middleware/role.middleware');
const {
  getLeads, getKanban, getLead, getLeadActivity,
  createLead, updateLead, deleteLead,
  sendWhatsApp, bulkWhatsApp,
  syncFromSheet, syncFromUrl, importCsv,
  getCrmSettings, saveCrmSettings,
} = require('../controllers/crm.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate);

router.get('/kanban',                   getKanban);
router.get('/leads',                    getLeads);
router.get('/leads/:id',                getLead);
router.get('/leads/:id/activity',       getLeadActivity);

router.post('/leads',                   requireMinRole('EMPLOYEE'), createLead);
router.patch('/leads/:id',              requireMinRole('EMPLOYEE'), updateLead);
router.delete('/leads/:id',             requireMinRole('MANAGER'),  deleteLead);

router.post('/leads/:id/whatsapp',      requireMinRole('EMPLOYEE'), sendWhatsApp);
router.post('/bulk-whatsapp',           requireMinRole('EMPLOYEE'), bulkWhatsApp);

router.post('/sync',                    requireMinRole('MANAGER'),  syncFromSheet);
router.post('/sync-url',                requireMinRole('MANAGER'),  syncFromUrl);
router.post('/import-csv',              requireMinRole('MANAGER'),  upload.single('file'), importCsv);

router.get('/settings',                 requireMinRole('MANAGER'),  getCrmSettings);
router.put('/settings',                 requireMinRole('MANAGER'),  saveCrmSettings);

module.exports = router;
