const router = require('express').Router();
const ctrl = require('../controllers/crm.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const Organization = require('../models/Organization');
const { syncLeadsFromSheet, previewSheet, hasWriteCredentials } = require('../services/googleSheets.service');

router.use(authenticate, orgIsolation);

// ── Google Sheets Integration ─────────────────────────────────────────────────

router.get('/sheets/config', asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organizationId).select('googleSheets name');
  const writeBackAvailable = hasWriteCredentials();
  const serviceAccountEmail = writeBackAvailable ? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL : null;
  sendSuccess(res, {
    config: {
      ...(org.googleSheets?.toObject ? org.googleSheets.toObject() : org.googleSheets || {}),
      writeBackAvailable,
      serviceAccountEmail,
    },
  });
}));

router.put('/sheets/config', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const { sheetId, sheetGid, sheetName, syncEnabled, defaultAssignTo, writeBackEnabled } = req.body;
  const org = await Organization.findByIdAndUpdate(
    req.user.organizationId,
    {
      'googleSheets.sheetId': sheetId?.trim() || '',
      'googleSheets.sheetGid': sheetGid?.trim() || '',
      'googleSheets.sheetName': sheetName?.trim() || 'Sheet1',
      'googleSheets.syncEnabled': !!syncEnabled,
      'googleSheets.syncIntervalMinutes': 5,
      'googleSheets.defaultAssignTo': defaultAssignTo || undefined,
      'googleSheets.writeBackEnabled': !!writeBackEnabled,
    },
    { new: true }
  ).select('googleSheets');
  sendSuccess(res, { config: org.googleSheets }, 'Google Sheets config saved');
}));

// Preview first 5 rows before committing to sync
router.post('/sheets/preview', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const { sheetId, sheetGid } = req.body;
  if (!sheetId) return sendError(res, 'sheetId is required', 400);
  try {
    const result = await previewSheet(sheetId, sheetGid || '');
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 400);
  }
}));

router.post('/sheets/sync', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organizationId).select('googleSheets');
  const { sheetId, sheetGid, sheetName, defaultAssignTo, columnMap } = org.googleSheets || {};
  if (!sheetId) return sendError(res, 'No Google Sheet configured. Connect your sheet first.', 400);

  try {
    const result = await syncLeadsFromSheet(
      req.user.organizationId,
      sheetId,
      sheetGid || '',
      sheetName || 'Sheet1',
      defaultAssignTo,
      columnMap || {}
    );

    await Organization.findByIdAndUpdate(req.user.organizationId, {
      'googleSheets.lastSyncedAt': new Date(),
      'googleSheets.lastSyncResult': result,
    });

    sendSuccess(res, result, `Sync complete: ${result.synced} new, ${result.updated || 0} updated`);
  } catch (err) {
    await Organization.findByIdAndUpdate(req.user.organizationId, {
      'googleSheets.lastSyncedAt': new Date(),
      'googleSheets.lastSyncResult': { error: err.message },
    });
    sendError(res, err.message, 400);
  }
}));

// ── Leads ─────────────────────────────────────────────────────────────────────

router.get('/leads', ctrl.getLeads);
router.post('/leads', ctrl.createLead);
router.get('/leads/pipeline', ctrl.getPipeline);
router.get('/leads/analytics', ctrl.getAnalytics);
router.get('/leads/:id', ctrl.getLead);
router.put('/leads/:id', ctrl.updateLead);
router.post('/leads/:id/followup', ctrl.addFollowUp);
router.post('/leads/:id/assign', ctrl.assignLead);
router.post('/leads/:id/convert-to-task', ctrl.convertToTask);
router.delete('/leads/:id', ctrl.deleteLead);

module.exports = router;
