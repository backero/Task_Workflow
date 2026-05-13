const express = require('express');
const router  = express.Router();
const { authenticate }    = require('../middleware/auth.middleware');
const { requireMinRole }  = require('../middleware/role.middleware');
const { uploadFile }      = require('../middleware/upload.middleware');
const { importEmployees, importInventory, importTransactions, downloadTemplate } = require('../controllers/import.controller');

router.use(authenticate);

router.get('/template/:type', downloadTemplate);
router.post('/employees',    requireMinRole('MANAGER'), uploadFile.single('file'), importEmployees);
router.post('/inventory',    requireMinRole('MANAGER'), uploadFile.single('file'), importInventory);
router.post('/transactions', requireMinRole('MANAGER'), uploadFile.single('file'), importTransactions);

module.exports = router;
