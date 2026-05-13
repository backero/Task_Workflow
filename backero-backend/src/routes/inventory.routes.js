const router = require('express').Router();
const ctrl = require('../controllers/inventory.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const upload = require('../middleware/upload.middleware');
const { buildProductTemplate, importProducts } = require('../services/import.service');

router.use(authenticate, orgIsolation);

// GET /api/inventory/import/template
router.get('/import/template', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const wb = await buildProductTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="backero_products_template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}));

// POST /api/inventory/import
router.post('/import', authorizeAdminOrAbove, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, 'No file uploaded.', 400);
  const results = await importProducts(req.file.buffer, req.user.organizationId, req.user._id);
  sendSuccess(res, results, `Import complete: ${results.imported} added, ${results.skipped} skipped`);
}));

router.get('/products', ctrl.getProducts);
router.post('/products', ctrl.createProduct);
router.get('/products/:id', ctrl.getProduct);
router.put('/products/:id', ctrl.updateProduct);
router.get('/movements', ctrl.getMovements);
router.get('/alerts', ctrl.getLowStockAlerts);
router.get('/analytics', ctrl.getAnalytics);
router.post('/stock-in', ctrl.stockIn);
router.post('/stock-out', ctrl.stockOut);
router.post('/adjustment', ctrl.stockAdjustment);

module.exports = router;
