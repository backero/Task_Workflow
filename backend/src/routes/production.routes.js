const express    = require('express');
const router     = express.Router();
const { authenticate }  = require('../middleware/auth.middleware');
const { requireMinRole } = require('../middleware/role.middleware');
const orgIsolation = require('../middleware/orgIsolation.middleware');
const {
  listOrders, getOrder, getStats,
  createOrder, startOrder, completeOrder, cancelOrder,
  recordQualityTest,
} = require('../controllers/production.controller');

router.use(authenticate, orgIsolation);

router.get('/stats',              getStats);
router.get('/',                   listOrders);
router.get('/:id',                getOrder);
router.post('/',                  requireMinRole('MANAGER'), createOrder);
router.patch('/:id/start',        requireMinRole('MANAGER'), startOrder);
router.patch('/:id/complete',     requireMinRole('MANAGER'), completeOrder);
router.patch('/:id/cancel',       requireMinRole('MANAGER'), cancelOrder);
router.post('/quality-test',      requireMinRole('MANAGER'), recordQualityTest);

module.exports = router;
