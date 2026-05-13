const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { requireMinRole } = require('../middleware/role.middleware');
const {
  listProducts, getInventoryStats, getProduct,
  createProduct, updateProduct, deleteProduct,
  stockIn, stockOut, getMovements, getCategories,
} = require('../controllers/inventory.controller');

router.use(authenticate);

// Read — all org members
router.get('/',                  listProducts);
router.get('/stats',             getInventoryStats);
router.get('/categories',        getCategories);
router.get('/movements',         getMovements);
router.get('/:id',               getProduct);
router.get('/:id/movements',     getMovements);

// Write — MANAGER and above
router.post('/',                 requireMinRole('MANAGER'), createProduct);
router.patch('/:id',             requireMinRole('MANAGER'), updateProduct);
router.post('/:id/stock-in',     requireMinRole('MANAGER'), stockIn);
router.post('/:id/stock-out',    requireMinRole('MANAGER'), stockOut);

// Delete — ADMIN and above
router.delete('/:id',            requireMinRole('ADMIN'), deleteProduct);

module.exports = router;
