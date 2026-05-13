const router = require('express').Router();
const ctrl = require('../controllers/task.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');

router.use(authenticate, orgIsolation);

router.get('/', ctrl.getTasks);
router.post('/', ctrl.createTask);
router.get('/analytics', ctrl.getAnalytics);
router.get('/:id', ctrl.getTask);
router.get('/:id/approvals', ctrl.getTaskApprovals);
router.put('/:id', ctrl.updateTask);
router.delete('/:id', ctrl.deleteTask);
router.post('/:id/start', ctrl.startTask);
router.post('/:id/request-completion', ctrl.requestCompletion);
router.post('/:id/daily-update', ctrl.addDailyUpdate);
router.post('/:id/comment', ctrl.addComment);
router.post('/:id/extension-request', ctrl.requestExtension);

module.exports = router;
