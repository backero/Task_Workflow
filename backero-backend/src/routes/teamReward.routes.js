const router = require('express').Router();
const ctrl = require('../controllers/teamReward.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeManagerOrAbove } = require('../middleware/role.middleware');

router.use(authenticate, orgIsolation);

router.get('/', ctrl.getTeamRewards);
router.post('/:id/grant', authorizeManagerOrAbove, ctrl.grantTeamReward);
router.post('/:id/skip', authorizeManagerOrAbove, ctrl.skipTeamReward);

module.exports = router;
