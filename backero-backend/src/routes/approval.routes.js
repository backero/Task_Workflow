const router = require('express').Router();
const ctrl = require('../controllers/approval.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');

router.use(authenticate, orgIsolation);

router.get('/', ctrl.getApprovals);
router.get('/stats', ctrl.getApprovalStats);
router.post('/:id/approve', ctrl.approveTask);
router.post('/:id/reject', ctrl.rejectTask);
router.post('/:id/request-changes', ctrl.requestChanges);

module.exports = router;
