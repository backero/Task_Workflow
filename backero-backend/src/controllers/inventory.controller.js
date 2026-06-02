const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const ActivityLog = require('../models/ActivityLog');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { STOCK_MOVEMENT_TYPES, SOCKET_EVENTS } = require('../utils/constants');

// GET /api/inventory/products
exports.getProducts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, category, search, isLowStock, isRawMaterial } = req.query;
  const { skip } = paginate(page, limit);

  const filter = { organizationId: req.user.organizationId, isActive: true };
  if (category) filter.category = category;
  if (isRawMaterial !== undefined) filter.isRawMaterial = isRawMaterial === 'true';
  if (isLowStock === 'true') filter.$expr = { $lte: ['$currentStock', '$minStockLevel'] };
  if (search) {
    const esc = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: esc, $options: 'i' } },
      { sku: { $regex: esc, $options: 'i' } },
      { category: { $regex: esc, $options: 'i' } },
    ];
  }

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ name: 1 }).skip(skip).limit(parseInt(limit)).lean(),
    Product.countDocuments(filter),
  ]);

  sendSuccess(res, paginateResponse(products, total, page, limit));
});

// POST /api/inventory/products
exports.createProduct = asyncHandler(async (req, res) => {
  const existing = await Product.findOne({ organizationId: req.user.organizationId, sku: req.body.sku?.toUpperCase() });
  if (existing) return sendError(res, 'Product with this SKU already exists.', 409);

  const product = await Product.create({
    ...req.body,
    sku: req.body.sku?.toUpperCase(),
    organizationId: req.user.organizationId,
    createdBy: req.user._id,
  });

  await ActivityLog.create({
    organizationId: req.user.organizationId,
    performedBy: req.user._id,
    action: 'product_created',
    module: 'inventory',
    reference: { model: 'Product', id: product._id, title: product.name },
  });

  sendSuccess(res, { product }, 'Product created', 201);
});

// GET /api/inventory/products/:id
exports.getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!product) return sendError(res, 'Product not found.', 404);

  const recentMovements = await StockMovement.find({ product: product._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('createdBy', 'firstName lastName');

  sendSuccess(res, { product, recentMovements });
});

// PUT /api/inventory/products/:id
exports.updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { ...req.body, updatedBy: req.user._id },
    { new: true, runValidators: true }
  );
  if (!product) return sendError(res, 'Product not found.', 404);
  sendSuccess(res, { product }, 'Product updated');
});

// POST /api/inventory/stock-in
exports.stockIn = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { productId, quantity, unitPrice, notes, batch, reference } = req.body;

  const product = await Product.findOne({ _id: productId, organizationId: req.user.organizationId });
  if (!product) return sendError(res, 'Product not found.', 404);
  if (quantity <= 0) return sendError(res, 'Quantity must be positive.', 400);

  const previousStock = product.currentStock;
  product.currentStock += quantity;
  product.updatedBy = req.user._id;
  await product.save();

  const movement = await StockMovement.create({
    organizationId: req.user.organizationId,
    product: productId,
    type: STOCK_MOVEMENT_TYPES.IN,
    quantity,
    previousStock,
    newStock: product.currentStock,
    unitPrice: unitPrice || product.costPrice,
    totalValue: quantity * (unitPrice || product.costPrice),
    notes, batch, reference,
    createdBy: req.user._id,
  });

  await ActivityLog.create({
    organizationId: req.user.organizationId,
    performedBy: req.user._id,
    action: 'stock_in',
    module: 'inventory',
    reference: { model: 'Product', id: product._id, title: product.name },
    previousData: { stock: previousStock },
    newData: { stock: product.currentStock, quantityAdded: quantity },
  });

  sendSuccess(res, { product, movement }, 'Stock added successfully');
});

// POST /api/inventory/stock-out
exports.stockOut = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { productId, quantity, type = STOCK_MOVEMENT_TYPES.OUT, notes, reference } = req.body;

  const product = await Product.findOne({ _id: productId, organizationId: req.user.organizationId });
  if (!product) return sendError(res, 'Product not found.', 404);
  if (quantity <= 0) return sendError(res, 'Quantity must be positive.', 400);
  if (product.currentStock < quantity) return sendError(res, `Insufficient stock. Available: ${product.currentStock} ${product.unit}`, 400);

  const previousStock = product.currentStock;
  product.currentStock -= quantity;
  product.updatedBy = req.user._id;
  await product.save();

  const movement = await StockMovement.create({
    organizationId: req.user.organizationId,
    product: productId,
    type,
    quantity: -quantity,
    previousStock,
    newStock: product.currentStock,
    unitPrice: product.costPrice,
    totalValue: quantity * product.costPrice,
    notes, reference,
    createdBy: req.user._id,
  });

  // Low stock alert
  if (product.currentStock <= product.minStockLevel) {
    io?.to(`org:${req.user.organizationId}`).emit(SOCKET_EVENTS.INVENTORY_LOW, {
      product: { _id: product._id, name: product.name, sku: product.sku, currentStock: product.currentStock, minStockLevel: product.minStockLevel },
    });
  }

  sendSuccess(res, { product, movement }, 'Stock deducted successfully');
});

// POST /api/inventory/adjustment
exports.stockAdjustment = asyncHandler(async (req, res) => {
  const { productId, newStock, notes } = req.body;

  const product = await Product.findOne({ _id: productId, organizationId: req.user.organizationId });
  if (!product) return sendError(res, 'Product not found.', 404);
  if (newStock < 0) return sendError(res, 'Stock cannot be negative.', 400);

  const previousStock = product.currentStock;
  const diff = newStock - previousStock;
  product.currentStock = newStock;
  product.updatedBy = req.user._id;
  await product.save();

  await StockMovement.create({
    organizationId: req.user.organizationId,
    product: productId,
    type: STOCK_MOVEMENT_TYPES.ADJUSTMENT,
    quantity: diff,
    previousStock,
    newStock,
    notes,
    createdBy: req.user._id,
  });

  sendSuccess(res, { product }, 'Stock adjusted');
});

// GET /api/inventory/movements
exports.getMovements = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30, productId, type, dateFrom, dateTo } = req.query;
  const { skip } = paginate(page, limit);

  const filter = { organizationId: req.user.organizationId };
  if (productId) filter.product = productId;
  if (type) filter.type = type;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const [movements, total] = await Promise.all([
    StockMovement.find(filter)
      .populate('product', 'name sku unit')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    StockMovement.countDocuments(filter),
  ]);

  sendSuccess(res, paginateResponse(movements, total, page, limit));
});

// GET /api/inventory/alerts
exports.getLowStockAlerts = asyncHandler(async (req, res) => {
  const products = await Product.find({
    organizationId: req.user.organizationId,
    isActive: true,
    $expr: { $lte: ['$currentStock', '$minStockLevel'] },
  }).sort({ currentStock: 1 }).lean();

  sendSuccess(res, { alerts: products, count: products.length });
});

// GET /api/inventory/analytics
exports.getAnalytics = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;

  const [totalProducts, lowStockCount, categoryBreakdown, stockValue] = await Promise.all([
    Product.countDocuments({ organizationId: orgId, isActive: true }),
    Product.countDocuments({ organizationId: orgId, isActive: true, $expr: { $lte: ['$currentStock', '$minStockLevel'] } }),
    Product.aggregate([{ $match: { organizationId: orgId, isActive: true } }, { $group: { _id: '$category', count: { $sum: 1 }, totalStock: { $sum: '$currentStock' } } }]),
    Product.aggregate([{ $match: { organizationId: orgId, isActive: true } }, { $group: { _id: null, totalValue: { $sum: { $multiply: ['$currentStock', '$costPrice'] } } } }]),
  ]);

  sendSuccess(res, { analytics: { totalProducts, lowStockCount, categoryBreakdown, totalInventoryValue: stockValue[0]?.totalValue || 0 } });
});

exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!product) return sendError(res, 'Product not found.', 404);

  await product.deleteOne();

  await ActivityLog.create({
    organizationId: req.user.organizationId,
    performedBy: req.user._id,
    action: 'product_deleted',
    module: 'inventory',
    reference: { model: 'Product', id: product._id, title: product.name },
  });

  sendSuccess(res, {}, 'Product deleted');
});
