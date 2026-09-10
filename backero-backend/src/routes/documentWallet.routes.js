const router = require('express').Router();
const ctrl = require('../controllers/documentWallet.controller');
const upload = require('../middleware/documentUpload.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeManagerOrAbove } = require('../middleware/role.middleware');

// Google Drive OAuth handshake — connect-url needs an authed manager to
// trigger it, but Google's redirect back to callback carries no auth header
// (or org context), so both stay outside the router-wide auth below.
router.get('/drive/connect-url', authenticate, authorizeManagerOrAbove, ctrl.driveConnectUrl);
router.get('/drive/callback', ctrl.driveCallback);

router.use(authenticate, orgIsolation);

router.get('/drive/status', authorizeManagerOrAbove, ctrl.driveStatus);

router.get('/', ctrl.list);

router.get('/categories', ctrl.getCategories);
router.post('/categories', authorizeManagerOrAbove, ctrl.addCategory);
router.delete('/categories/:catId', authorizeManagerOrAbove, ctrl.deleteCategory);

router.get('/trash', authorizeManagerOrAbove, ctrl.listTrash);
router.post('/trash/:trashId/restore', authorizeManagerOrAbove, ctrl.restoreTrash);
router.delete('/trash/:trashId', authorizeManagerOrAbove, ctrl.purgeTrash);
router.delete('/trash', authorizeManagerOrAbove, ctrl.emptyTrash);

router.get('/files/:driveId/content', ctrl.streamFile);

router.get('/reminders/preview', authorizeManagerOrAbove, ctrl.remindersPreview);
router.post('/reminders/send-now', authorizeManagerOrAbove, ctrl.remindersSendNow);

router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.softDelete);

router.post('/:id/upload', upload.single('file'), ctrl.uploadFile);
router.post('/:id/versions', ctrl.addVersion);
router.delete('/:id/versions/:versionId/files/:fileId', ctrl.deleteVersionFile);

module.exports = router;
