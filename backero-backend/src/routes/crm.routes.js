const router = require('express').Router();
const ctrl = require('../controllers/crm.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove, authorizeManagerOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const multer = require('multer');
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_, f, cb) => cb(null, f.mimetype.startsWith('image/')) });
const commLogUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 }, fileFilter: (_, f, cb) => cb(null, f.mimetype.startsWith('image/') || f.mimetype.startsWith('audio/') || f.mimetype.startsWith('video/')) });
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
router.get('/leads/pipeline', ctrl.getPipeline);
router.get('/leads/analytics', ctrl.getAnalytics);
router.get('/leads/analytics/rep', authorizeManagerOrAbove, ctrl.getRepAnalytics);
router.get('/leads/analytics/velocity', authorizeManagerOrAbove, ctrl.getPipelineVelocity);
router.get('/leads/by-task/:taskId', ctrl.getLeadByTask);
router.get('/leads/:id', ctrl.getLead);
router.post('/leads', authorizeManagerOrAbove, ctrl.createLead);
router.put('/leads/:id', authorizeManagerOrAbove, ctrl.updateLead);
router.put('/leads/:id/sample', authorizeManagerOrAbove, ctrl.updateSampleDetails);
router.post('/leads/:id/sample/team-update', authorizeManagerOrAbove, ctrl.addSampleTeamUpdate);
router.post('/leads/:id/sample/client-note', authorizeManagerOrAbove, ctrl.addSampleClientNote);
router.post('/leads/:id/sample/image', authorizeManagerOrAbove, ctrl.addSampleImage);
router.post('/leads/:id/comm-log', authorizeManagerOrAbove, commLogUpload.array('files', 10), ctrl.addCommLog);
router.put('/leads/:id/comm-log/:logId', authorizeAdminOrAbove, ctrl.editCommLog);
router.delete('/leads/:id/comm-log/:logId', authorizeAdminOrAbove, ctrl.deleteCommLog);
router.post('/leads/:id/sample-invoice', authorizeManagerOrAbove, ctrl.createSampleInvoice);
router.post('/leads/:id/followup', authorizeManagerOrAbove, ctrl.addFollowUp);
router.post('/leads/:id/assign', authorizeManagerOrAbove, ctrl.assignLead);
router.post('/leads/:id/convert-to-task', authorizeManagerOrAbove, ctrl.convertToTask);
router.post('/leads/:id/send-update', authorizeManagerOrAbove, ctrl.sendClientUpdate);
router.delete('/leads/:id', authorizeManagerOrAbove, ctrl.deleteLead);

// ── Technical Queries ─────────────────────────────────────────────────────────

router.post('/leads/:id/query', ctrl.raiseQuery);
router.get('/leads/:id/queries', ctrl.getLeadQueries);
router.get('/queries', ctrl.getQueries);
router.put('/queries/:queryId/reply', ctrl.answerQuery);

module.exports = router;
