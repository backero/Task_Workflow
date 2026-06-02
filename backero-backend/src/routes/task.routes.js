const router = require('express').Router();
const ctrl       = require('../controllers/task.controller');
const importCtrl = require('../controllers/taskImport.controller');
const upload     = require('../middleware/upload.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove, authorizeManagerOrAbove } = require('../middleware/role.middleware');

router.use(authenticate, orgIsolation);

router.get('/', ctrl.getTasks);
router.get('/analytics', ctrl.getAnalytics);
router.get('/extension-requests', ctrl.getExtensionRequests);

// Bulk import (must be before /:id routes)
router.get('/import/template', importCtrl.downloadTemplate);
router.post('/import', authorizeAdminOrAbove, upload.single('file'), importCtrl.importTasks);
router.get('/:id/tree', ctrl.getTaskTree);
router.get('/:id', ctrl.getTask);
router.get('/:id/approvals', ctrl.getTaskApprovals);

// Manager+ can create and edit tasks
router.post('/', authorizeManagerOrAbove, ctrl.createTask);
router.put('/:id', authorizeManagerOrAbove, ctrl.updateTask);
router.patch('/:id/archive', authorizeAdminOrAbove, ctrl.archiveTask);
router.delete('/:id', authorizeAdminOrAbove, ctrl.deleteTask);

// Self-service — any logged-in member can use these on their own tasks
router.post('/:id/start', ctrl.startTask);
router.post('/:id/request-completion', ctrl.requestCompletion);
router.post('/:id/daily-update', ctrl.addDailyUpdate);
router.post('/:id/comment', ctrl.addComment);
router.post('/:id/extension-request', ctrl.requestExtension);

// Admin+ only — review/approval actions
router.patch('/:id/extension-request/:reqId', authorizeManagerOrAbove, ctrl.reviewExtensionRequest);
router.post('/:id/hub-approve', authorizeAdminOrAbove, ctrl.approveDeptHub);
router.post('/:id/hub-reject', authorizeAdminOrAbove, ctrl.rejectDeptHub);
router.post('/:id/manager-assign-approve', authorizeAdminOrAbove, ctrl.approveManagerAssignment);
router.post('/:id/manager-assign-reject', authorizeAdminOrAbove, ctrl.rejectManagerAssignment);

module.exports = router;
