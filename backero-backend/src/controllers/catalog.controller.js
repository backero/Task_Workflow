const CatalogProduct = require('../models/CatalogProduct');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const { uploadBuffer } = require('../utils/cloudinary');

// GET /api/catalog/stats
exports.getStats = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const [total, active, discontinued, byCategory] = await Promise.all([
    CatalogProduct.countDocuments({ organizationId: orgId }),
    CatalogProduct.countDocuments({ organizationId: orgId, status: 'Active' }),
    CatalogProduct.countDocuments({ organizationId: orgId, status: 'Discontinued' }),
    CatalogProduct.aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);
  sendSuccess(res, { total, active, discontinued, byCategory });
});

// GET /api/catalog/products
exports.getProducts = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { search, category, status, limit = 500 } = req.query;
  const filter = { organizationId: orgId };
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (search) {
    const s = new RegExp(search, 'i');
    filter.$or = [{ name: s }, { code: s }, { category: s }, { hsnCode: s }, { barcode: s }];
  }
  const products = await CatalogProduct.find(filter)
    .select('code name category subCategory type unit weight gstRate hsnCode status image variants createdAt')
    .sort({ category: 1, name: 1 })
    .limit(Number(limit));
  sendSuccess(res, { products, total: products.length });
});

// GET /api/catalog/products/:id
exports.getProduct = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  sendSuccess(res, { product: p });
});

// POST /api/catalog/products
exports.createProduct = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const exists = await CatalogProduct.findOne({ organizationId: orgId, code: req.body.code?.toUpperCase?.() || req.body.code });
  if (exists) return sendError(res, 'SKU already exists: ' + req.body.code, 400);

  const p = await CatalogProduct.create({
    ...req.body,
    organizationId: orgId,
    createdBy: req.user._id,
    history: [{ action: 'Product created', detail: 'SKU: ' + req.body.code }],
    packaging: req.body.packaging || {
      items: [
        { name: 'Primary Box', qty: 1, rate: 0, amount: 0, optional: false },
        { name: 'Label', qty: 1, rate: 0, amount: 0, optional: true },
        { name: 'Bubble Wrap', qty: 1, rate: 0, amount: 0, optional: true },
        { name: 'Shipping Label', qty: 1, rate: 0, amount: 0, optional: false },
      ],
      charges: { machine: 0, shrinkWrap: 0, other: 0 },
    },
    marketplace: req.body.marketplace || {
      packaging: [
        { name: 'Primary Box', qty: 1, rate: 0, amount: 0, optional: false },
        { name: 'Label', qty: 1, rate: 0, amount: 0, optional: true },
        { name: 'Bubble Wrap', qty: 1, rate: 0, amount: 0, optional: true },
        { name: 'Shipping Label', qty: 1, rate: 0, amount: 0, optional: false },
      ],
      fees: {
        flipkart: { commission: 15, fixed: 30, shipping: 50, collection: 2 },
        amazon: { commission: 15, fixed: 40, shipping: 50, fba: 3 },
        meesho: { commission: 0, shipping: 70, collection: 0, penalty: 2 },
        snapdeal: { commission: 12, fixed: 20, shipping: 50, collection: 1.5 },
      },
      margins: { flipkart: 25, amazon: 25, meesho: 30, snapdeal: 25 },
    },
  });
  sendSuccess(res, { product: p }, 'Product created');
});

// PUT /api/catalog/products/:id
exports.updateProduct = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { ...req.body, updatedAt: new Date() },
    { new: true, runValidators: false }
  );
  if (!p) return sendError(res, 'Product not found', 404);
  sendSuccess(res, { product: p }, 'Product updated');
});

// DELETE /api/catalog/products/:id
exports.deleteProduct = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  sendSuccess(res, {}, 'Product deleted');
});

// POST /api/catalog/products/:id/image  (multipart)
exports.uploadImage = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  if (!req.file) return sendError(res, 'No file uploaded', 400);
  const result = await uploadBuffer(req.file.buffer, { folder: `backero/catalog/${req.user.organizationId}` });
  p.image = result.secure_url;
  await p.save();
  sendSuccess(res, { image: p.image }, 'Image uploaded');
});

// POST /api/catalog/import  — bulk import from localStorage JSON dump
exports.importProducts = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { products = [] } = req.body;
  if (!products.length) return sendError(res, 'No products provided', 400);

  let created = 0, skipped = 0;
  for (const raw of products) {
    const code = (raw.code || '').toUpperCase();
    if (!code || !raw.name || !raw.category) { skipped++; continue; }
    const exists = await CatalogProduct.findOne({ organizationId: orgId, code });
    if (exists) { skipped++; continue; }
    await CatalogProduct.create({
      organizationId: orgId,
      createdBy: req.user._id,
      code,
      name: raw.name,
      category: raw.category,
      subCategory: raw.subCategory || '',
      type: raw.type || '',
      unit: raw.unit || 'ml',
      weight: raw.weight || 0,
      gstRate: raw.gstRate || 18,
      hsnCode: raw.hsnCode || '',
      shelfLife: raw.shelfLife || 0,
      status: raw.status || 'Active',
      description: raw.description || '',
      storage: raw.storage || '',
      certifications: raw.certifications || '',
      barcode: raw.barcode || '',
      image: raw.image || null,
      formulation: raw.formulation || { refWeight: raw.weight || 100, refUnit: raw.unit || 'ml', rows: [] },
      variants: (raw.variants || []).map(v => ({
        name: v.name, weight: v.weight || 0, unit: v.unit || raw.unit || 'ml',
        stock: v.stock || 0, stockUnit: v.stockUnit || 'pcs',
        mrp: v.mrp || 0, sellingPrice: v.sellingPrice || 0, b2bPrice: v.b2bPrice || 0, costPrice: 0,
      })),
      history: [{ action: 'Imported from catalog', detail: 'SKU: ' + code }],
    });
    created++;
  }
  sendSuccess(res, { created, skipped }, `Imported ${created} products, skipped ${skipped}`);
});
