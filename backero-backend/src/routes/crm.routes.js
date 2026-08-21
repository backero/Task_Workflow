const router = require('express').Router();
const ctrl = require('../controllers/crm.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove, authorizeManagerOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const multer = require('multer');
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_, f, cb) => cb(null, f.mimetype.startsWith('image/')) });
const commLogUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 }, fileFilter: (_, f, cb) => cb(null, f.mimetype.startsWith('image/') || f.mimetype.startsWith('audio/') || f.mimetype.startsWith('video/')) });
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
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
router.put('/leads/:id', ctrl.updateLead);
router.put('/leads/:id/sample', ctrl.updateSampleDetails);
router.put('/leads/:id/sample/stage', ctrl.updateSampleSubStage);
router.post('/leads/:id/formulas', ctrl.createFormula);
router.put('/leads/:id/formulas/:formulaId', ctrl.updateFormula);
router.post('/leads/:id/formulas/:formulaId/attachment', docUpload.single('file'), ctrl.uploadFormulaAttachment);
router.delete('/leads/:id/formulas/:formulaId/attachment', ctrl.removeFormulaAttachment);
router.post('/leads/:id/products', ctrl.linkProductPricing);
router.put('/leads/:id/products/:productId', ctrl.updateProductPricing);
router.delete('/leads/:id/products/:productId', ctrl.deleteProductLink);
router.post('/leads/:id/samples', ctrl.createVersionedSample);
router.put('/leads/:id/samples/:sampleId', ctrl.updateVersionedSample);
router.put('/leads/:id/samples/:sampleId/status', ctrl.updateVersionedSampleStatus);
router.post('/leads/:id/samples/:sampleId/feedback', ctrl.addSampleFeedback);
router.post('/leads/:id/sample/team-update', ctrl.addSampleTeamUpdate);
router.post('/leads/:id/sample/client-note', ctrl.addSampleClientNote);
router.post('/leads/:id/sample/image', ctrl.addSampleImage);
router.post('/leads/:id/comm-log', authorizeManagerOrAbove, commLogUpload.array('files', 10), ctrl.addCommLog);
router.put('/leads/:id/comm-log/:logId', authorizeAdminOrAbove, ctrl.editCommLog);
router.delete('/leads/:id/comm-log/:logId', authorizeAdminOrAbove, ctrl.deleteCommLog);
router.post('/leads/:id/sample-invoice', ctrl.createSampleInvoice);
router.post('/leads/:id/followup', authorizeManagerOrAbove, ctrl.addFollowUp);
router.post('/leads/:id/assign', authorizeManagerOrAbove, ctrl.assignLead);
router.post('/leads/:id/convert-to-task', authorizeManagerOrAbove, ctrl.convertToTask);
router.post('/leads/:id/link-production', ctrl.linkProduction);
router.post('/leads/:id/samples/:sampleId/quotation', ctrl.createSampleQuotation);
router.post('/leads/:id/samples/:sampleId/invoice', ctrl.createSampleFinalInvoice);
router.post('/leads/:id/samples/:sampleId/link-production', ctrl.linkSampleProduction);
router.get('/production-orders/unlinked', authorizeManagerOrAbove, ctrl.getUnlinkedProductionOrders);
router.post('/leads/:id/dispatch', commLogUpload.single('file'), ctrl.dispatchLead);
router.post('/leads/:id/send-update', authorizeManagerOrAbove, ctrl.sendClientUpdate);
router.delete('/leads/:id', ctrl.deleteLead);

// ── Technical Queries ─────────────────────────────────────────────────────────

router.post('/leads/:id/query', ctrl.raiseQuery);
router.get('/leads/:id/queries', ctrl.getLeadQueries);
router.get('/queries', ctrl.getQueries);
router.put('/queries/:queryId', ctrl.updateQuery);
router.put('/queries/:queryId/delete', ctrl.setQueryDeleted);
router.put('/queries/:queryId/reply', ctrl.answerQuery);
router.put('/queries/:queryId/status', ctrl.updateQueryStatus);
router.put('/queries/:queryId/link', ctrl.linkQuery);
router.post('/queries/:queryId/attachment', docUpload.single('file'), ctrl.uploadQueryAttachment);
router.delete('/queries/:queryId/attachment', ctrl.removeQueryAttachment);
router.post('/queries/:queryId/reply-attachment', docUpload.single('file'), ctrl.uploadQueryReplyAttachment);
router.delete('/queries/:queryId/reply-attachment', ctrl.removeQueryReplyAttachment);

module.exports = router;
