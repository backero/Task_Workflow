const router = require('express').Router();
const ctrl   = require('../controllers/rawmaterial.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);
router.get('/',          ctrl.list);
router.get('/stats',     ctrl.getStats);
router.post('/',         ctrl.create);
router.post('/import',   ctrl.bulkImport);
router.put('/:id',       ctrl.update);
router.delete('/:id',    ctrl.remove);

module.exports = router;
