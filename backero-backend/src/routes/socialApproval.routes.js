const router = require('express').Router();
const ctrl = require('../controllers/socialApproval.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeMarketingApprover } = require('../middleware/role.middleware');

router.use(authenticate, orgIsolation, authorizeMarketingApprover);

router.get('/', ctrl.listSocialApprovals);
router.get('/stats', ctrl.getSocialApprovalStats);
router.post('/:id/approve', ctrl.approveSocialApproval);
router.post('/:id/reject', ctrl.rejectSocialApproval);

module.exports = router;
