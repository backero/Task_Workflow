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
  product.lastStockIn = new Date();
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

// ── RAW MATERIALS ──────────────────────────────────────────────────────────

// GET /api/inventory/raw-materials/stats
exports.getRawMaterialStats = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const today = new Date();
  const in30 = new Date(); in30.setDate(today.getDate() + 30);

  const materials = await Product.find({ organizationId: orgId, isRawMaterial: true, isActive: true }).lean();

  let totalValue = 0, lowStockCount = 0, expiringCount = 0;
  for (const m of materials) {
    const stock = (m.batches || []).reduce((s, b) => s + (b.quantity || 0), 0);
    totalValue += stock * (m.costPrice || 0);
    if (m.enableMinStock && stock <= (m.minStockLevel || 0)) lowStockCount++;
    const hasExpiring = (m.batches || []).some(b => {
      if (!b.expiryDate) return false;
      const e = new Date(b.expiryDate);
      return e >= today && e <= in30;
    });
    if (hasExpiring) expiringCount++;
  }

  sendSuccess(res, { total: materials.length, totalValue, lowStockCount, expiringCount });
});

// GET /api/inventory/raw-materials
exports.getRawMaterials = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = { organizationId: req.user.organizationId, isRawMaterial: true, isActive: true };
  if (search) {
    const esc = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: esc, $options: 'i' } },
      { sku: { $regex: esc, $options: 'i' } },
      { category: { $regex: esc, $options: 'i' } },
      { supplier: { $regex: esc, $options: 'i' } },
      { hsnCode: { $regex: esc, $options: 'i' } },
    ];
  }
  const materials = await Product.find(filter).sort({ name: 1 }).lean();
  sendSuccess(res, { materials });
});

// POST /api/inventory/raw-materials
exports.createRawMaterial = asyncHandler(async (req, res) => {
  const { name, hsnCode, category, supplier, warehouseLocation, unit, costPrice, gstRate,
    initialStock, initialExpiry, initialBatchNumber,
    enableMinStock, minStockLevel,
    qcChecker, qcNumber, refCheckNumber, qcPassed, qcNotes } = req.body;

  // Auto-generate RM-xxxx SKU
  const count = await Product.countDocuments({ organizationId: req.user.organizationId, isRawMaterial: true });
  const sku = 'RM-' + String(count + 1).padStart(4, '0');

  const batches = [];
  if (parseFloat(initialStock) > 0) {
    batches.push({
      batchId: 'BATCH-' + Date.now(),
      quantity: parseFloat(initialStock),
      price: parseFloat(costPrice) || 0,
      batchNumber: initialBatchNumber || ('LOT-' + sku),
      expiryDate: initialExpiry || null,
      receivedDate: new Date(),
      notes: 'Initial stock',
    });
  }

  const product = await Product.create({
    organizationId: req.user.organizationId,
    name, hsnCode, category, supplier, warehouseLocation, unit,
    costPrice: parseFloat(costPrice) || 0,
    gstRate: parseInt(gstRate) || 0,
    currentStock: batches.reduce((s, b) => s + b.quantity, 0),
    enableMinStock: enableMinStock !== false,
    minStockLevel: parseFloat(minStockLevel) || 0,
    isRawMaterial: true, isFinishedGood: false, isSellable: false,
    sku,
    batches,
    qcChecker, qcNumber, refCheckNumber,
    qcPassed: !!qcPassed,
    qcNotes,
    createdBy: req.user._id,
  });

  sendSuccess(res, { product }, 'Raw material created', 201);
});

// PUT /api/inventory/raw-materials/:id
exports.updateRawMaterial = asyncHandler(async (req, res) => {
  const { name, hsnCode, category, supplier, warehouseLocation, unit, costPrice, gstRate,
    enableMinStock, minStockLevel,
    qcChecker, qcNumber, refCheckNumber, qcPassed, qcNotes } = req.body;

  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId, isRawMaterial: true },
    {
      name, hsnCode, category, supplier, warehouseLocation, unit,
      costPrice: parseFloat(costPrice) || 0,
      gstRate: parseInt(gstRate) || 0,
      enableMinStock: enableMinStock !== false,
      minStockLevel: parseFloat(minStockLevel) || 0,
      qcChecker, qcNumber, refCheckNumber,
      qcPassed: !!qcPassed,
      qcNotes,
      updatedBy: req.user._id,
    },
    { new: true, runValidators: true }
  );
  if (!product) return sendError(res, 'Raw material not found.', 404);
  sendSuccess(res, { product }, 'Raw material updated');
});

// POST /api/inventory/raw-materials/:id/batches
exports.addRawMaterialBatch = asyncHandler(async (req, res) => {
  const { quantity, price, batchNumber, expiryDate, receivedDate, notes } = req.body;
  const qty = parseFloat(quantity);
  if (!qty || qty <= 0) return sendError(res, 'Quantity must be positive.', 400);

  const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId, isRawMaterial: true });
  if (!product) return sendError(res, 'Raw material not found.', 404);

  const batchPrice = parseFloat(price) || product.costPrice || 0;
  product.batches.push({
    batchId: 'BATCH-' + Date.now(),
    quantity: qty,
    price: batchPrice,
    batchNumber: batchNumber || ('LOT-' + product.sku + '-' + (product.batches.length + 1)),
    expiryDate: expiryDate || null,
    receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
    notes: notes || '',
  });

  // Recompute total stock and weighted avg cost price
  const totalQty = product.batches.reduce((s, b) => s + (b.quantity || 0), 0);
  if (totalQty > 0) {
    const weightedSum = product.batches.reduce((s, b) => s + (b.quantity || 0) * (b.price || product.costPrice || 0), 0);
    product.costPrice = parseFloat((weightedSum / totalQty).toFixed(2));
  }
  product.currentStock = totalQty;
  product.lastStockIn = new Date();
  product.updatedBy = req.user._id;
  await product.save();

  sendSuccess(res, { product }, 'Batch added');
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
