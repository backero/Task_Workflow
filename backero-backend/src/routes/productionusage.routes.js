const router = require('express').Router();
const ctrl = require('../controllers/productionusage.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);
router.get('/',          ctrl.list);
router.post('/',         ctrl.recordIssue);
router.post('/:id/return', ctrl.recordReturn);

module.exports = router;
