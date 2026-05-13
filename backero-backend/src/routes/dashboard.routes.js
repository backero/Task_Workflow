const router = require('express').Router();
const ctrl = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove, authorizeManagerOrAbove } = require('../middleware/role.middleware');

router.use(authenticate, orgIsolation);

router.get('/founder', authorizeAdminOrAbove, ctrl.getFounderDashboard);
router.get('/manager', authorizeManagerOrAbove, ctrl.getManagerDashboard);
router.get('/employee', ctrl.getEmployeeDashboard);
router.get('/department/:dept', ctrl.getDepartmentDashboard);

module.exports = router;
