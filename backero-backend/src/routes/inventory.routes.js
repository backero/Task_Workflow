const router = require('express').Router();
const ctrl = require('../controllers/inventory.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove, authorizeManagerOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const upload = require('../middleware/upload.middleware');
const { buildProductTemplate, importProducts } = require('../services/import.service');
const QRCode = require('qrcode');
const Product = require('../models/Product');

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
router.get('/movements', ctrl.getMovements);
router.get('/alerts', ctrl.getLowStockAlerts);
router.get('/analytics', ctrl.getAnalytics);

// QR code for a product label (must be before /:id)
router.get('/products/:id/qr', asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
    .select('name sku _id');
  if (!product) return sendError(res, 'Product not found', 404);
  const svg = await QRCode.toString(`backero:inv:${product._id}`, { type: 'svg', margin: 1 });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svg);
}));

router.get('/products/:id', ctrl.getProduct);
router.post('/products', authorizeAdminOrAbove, ctrl.createProduct);
router.put('/products/:id', authorizeAdminOrAbove, ctrl.updateProduct);
router.delete('/products/:id', authorizeAdminOrAbove, ctrl.deleteProduct);
// Allow managers and above to do stock movements (warehouse ops)
router.post('/stock-in', authorizeManagerOrAbove, ctrl.stockIn);
router.post('/stock-out', authorizeManagerOrAbove, ctrl.stockOut);
router.post('/adjustment', authorizeManagerOrAbove, ctrl.stockAdjustment);

module.exports = router;
