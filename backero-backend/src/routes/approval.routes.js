const router = require('express').Router();
const ctrl = require('../controllers/approval.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove } = require('../middleware/role.middleware');

router.use(authenticate, orgIsolation);

router.get('/', ctrl.getApprovals);
router.get('/stats', ctrl.getApprovalStats);
router.post('/:id/approve', authorizeAdminOrAbove, ctrl.approveTask);
router.post('/:id/reject', authorizeAdminOrAbove, ctrl.rejectTask);
router.post('/:id/request-changes', authorizeAdminOrAbove, ctrl.requestChanges);

module.exports = router;
