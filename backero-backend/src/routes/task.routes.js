const router = require('express').Router();
const ctrl       = require('../controllers/task.controller');
const importCtrl = require('../controllers/taskImport.controller');
const upload     = require('../middleware/upload.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');

router.use(authenticate, orgIsolation);

router.get('/', ctrl.getTasks);
router.post('/', ctrl.createTask);
router.get('/analytics', ctrl.getAnalytics);
router.get('/extension-requests', ctrl.getExtensionRequests);

// Bulk import (must be before /:id routes)
router.get('/import/template', importCtrl.downloadTemplate);
router.post('/import', upload.single('file'), importCtrl.importTasks);
router.get('/:id/tree', ctrl.getTaskTree);
router.get('/:id', ctrl.getTask);
router.get('/:id/approvals', ctrl.getTaskApprovals);
router.put('/:id', ctrl.updateTask);
router.patch('/:id/archive', ctrl.archiveTask);
router.delete('/:id', ctrl.deleteTask);
router.post('/:id/start', ctrl.startTask);
router.post('/:id/request-completion', ctrl.requestCompletion);
router.post('/:id/daily-update', ctrl.addDailyUpdate);
router.post('/:id/comment', ctrl.addComment);
router.post('/:id/extension-request', ctrl.requestExtension);
router.patch('/:id/extension-request/:reqId', ctrl.reviewExtensionRequest);
router.post('/:id/hub-approve', ctrl.approveDeptHub);
router.post('/:id/hub-reject', ctrl.rejectDeptHub);
router.post('/:id/manager-assign-approve', ctrl.approveManagerAssignment);
router.post('/:id/manager-assign-reject', ctrl.rejectManagerAssignment);

module.exports = router;
