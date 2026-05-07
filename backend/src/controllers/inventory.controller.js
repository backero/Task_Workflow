const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const { success, created, notFound, badRequest } = require('../utils/response');
const { log } = require('../services/activityLog.service');
const { emitToOrg } = require('../sockets/index');
const logger = require('../utils/logger');

/* ─── helpers ──────────────────────────────────────────────────────────────── */

const emitLowStock = (orgId, product) => {
  if (product.quantity <= product.minStockThreshold) {
    emitToOrg(orgId, 'inventory:low_stock_alert', {
      productId: product._id,
      name: product.name,
      sku: product.sku,
      quantity: product.quantity,
      minStockThreshold: product.minStockThreshold,
    });
  }
};

/* ─── list / search ─────────────────────────────────────────────────────────── */

const listProducts = async (req, res) => {
  const orgId = req.user.organizationId;
  const { search, category, department, lowStock, page = 1, limit = 20 } = req.query;
  try {
    const filter = { organizationId: orgId, isActive: true };

    if (search) {
      const rx = { $regex: search, $options: 'i' };
      filter.$or = [{ name: rx }, { sku: rx }, { supplier: rx }, { category: rx }];
    }
    if (category)   filter.category   = { $regex: `^${category}$`, $options: 'i' };
    if (department) filter.department = { $regex: `^${department}$`, $options: 'i' };
    if (lowStock === 'true') {
      filter.$expr = { $lte: ['$quantity', '$minStockThreshold'] };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Product.countDocuments(filter),
    ]);

    const lowStockCount = await Product.countDocuments({
      organizationId: orgId,
      isActive: true,
      $expr: { $lte: ['$quantity', '$minStockThreshold'] },
    });

    return success(res, {
      products,
      total,
      lowStockCount,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    logger.error(`listProducts: ${err.message}`);
    throw err;
  }
};

/* ─── dashboard stats ───────────────────────────────────────────────────────── */

const getInventoryStats = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const [totals, byCategory, lowStockItems] = await Promise.all([
      Product.aggregate([
        { $match: { organizationId: orgId, isActive: true } },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            totalValue:    { $sum: { $multiply: ['$quantity', '$unitPrice'] } },
            totalStock:    { $sum: '$quantity' },
          },
        },
      ]),
      Product.aggregate([
        { $match: { organizationId: orgId, isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 }, value: { $sum: { $multiply: ['$quantity', '$unitPrice'] } } } },
        { $sort: { count: -1 } },
      ]),
      Product.find({
        organizationId: orgId,
        isActive: true,
        $expr: { $lte: ['$quantity', '$minStockThreshold'] },
      })
        .sort({ quantity: 1 })
        .limit(10)
        .lean(),
    ]);

    const t = totals[0] || { totalProducts: 0, totalValue: 0, totalStock: 0 };

    return success(res, {
      totalProducts: t.totalProducts,
      totalValue:    t.totalValue,
      totalStock:    t.totalStock,
      lowStockCount: lowStockItems.length,
      lowStockItems,
      byCategory,
    });
  } catch (err) {
    logger.error(`getInventoryStats: ${err.message}`);
    throw err;
  }
};

/* ─── single product ────────────────────────────────────────────────────────── */

const getProduct = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const product = await Product.findOne({ _id: req.params.id, organizationId: orgId }).lean();
    if (!product) return notFound(res, 'Product not found');

    const movements = await StockMovement.find({ productId: product._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('performedBy', 'name phone')
      .lean();

    return success(res, { product, movements });
  } catch (err) {
    logger.error(`getProduct: ${err.message}`);
    throw err;
  }
};

/* ─── create ────────────────────────────────────────────────────────────────── */

const createProduct = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const product = await Product.create({
      ...req.body,
      organizationId: orgId,
      createdBy: req.user._id,
    });

    await log({ userId: req.user._id, organizationId: orgId, action: 'PRODUCT_CREATED', entity: 'Product', entityId: product._id });
    emitToOrg(orgId.toString(), 'inventory:product_created', { product });
    emitToOrg(orgId.toString(), 'dashboard:stats_updated', {});
    emitLowStock(orgId.toString(), product);

    return created(res, { product }, 'Product added to inventory');
  } catch (err) {
    logger.error(`createProduct: ${err.message}`);
    if (err.code === 11000) return badRequest(res, 'A product with this SKU already exists');
    throw err;
  }
};

/* ─── update ────────────────────────────────────────────────────────────────── */

const updateProduct = async (req, res) => {
  const orgId = req.user.organizationId;
  // quantity changes must go through stock-in / stock-out
  const { quantity: _q, ...safeUpdates } = req.body;
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, organizationId: orgId },
      { $set: safeUpdates },
      { new: true, runValidators: true }
    );
    if (!product) return notFound(res, 'Product not found');

    await log({ userId: req.user._id, organizationId: orgId, action: 'PRODUCT_UPDATED', entity: 'Product', entityId: product._id });
    emitToOrg(orgId.toString(), 'inventory:product_updated', { product });
    emitLowStock(orgId.toString(), product);

    return success(res, { product }, 'Product updated');
  } catch (err) {
    logger.error(`updateProduct: ${err.message}`);
    if (err.code === 11000) return badRequest(res, 'A product with this SKU already exists');
    throw err;
  }
};

/* ─── delete (soft) ─────────────────────────────────────────────────────────── */

const deleteProduct = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, organizationId: orgId },
      { isActive: false },
      { new: true }
    );
    if (!product) return notFound(res, 'Product not found');

    await log({ userId: req.user._id, organizationId: orgId, action: 'PRODUCT_DELETED', entity: 'Product', entityId: product._id });
    emitToOrg(orgId.toString(), 'inventory:product_deleted', { productId: req.params.id });
    emitToOrg(orgId.toString(), 'dashboard:stats_updated', {});

    return success(res, {}, 'Product removed');
  } catch (err) {
    logger.error(`deleteProduct: ${err.message}`);
    throw err;
  }
};

/* ─── stock in ──────────────────────────────────────────────────────────────── */

const stockIn = async (req, res) => {
  const orgId = req.user.organizationId;
  const { quantity, note } = req.body;
  if (!quantity || quantity < 1) return badRequest(res, 'Quantity must be at least 1');
  try {
    const product = await Product.findOne({ _id: req.params.id, organizationId: orgId });
    if (!product) return notFound(res, 'Product not found');

    const before = product.quantity;
    product.quantity += Number(quantity);
    await product.save();

    const movement = await StockMovement.create({
      productId: product._id,
      organizationId: orgId,
      type: 'IN',
      quantity: Number(quantity),
      quantityBefore: before,
      quantityAfter:  product.quantity,
      note: note || null,
      performedBy: req.user._id,
    });

    await log({ userId: req.user._id, organizationId: orgId, action: 'STOCK_IN', entity: 'Product', entityId: product._id, meta: { quantity, before, after: product.quantity } });
    emitToOrg(orgId.toString(), 'inventory:stock_changed', { product, movement });

    return success(res, { product, movement }, `Stock increased by ${quantity}`);
  } catch (err) {
    logger.error(`stockIn: ${err.message}`);
    throw err;
  }
};

/* ─── stock out ─────────────────────────────────────────────────────────────── */

const stockOut = async (req, res) => {
  const orgId = req.user.organizationId;
  const { quantity, note } = req.body;
  if (!quantity || quantity < 1) return badRequest(res, 'Quantity must be at least 1');
  try {
    const product = await Product.findOne({ _id: req.params.id, organizationId: orgId });
    if (!product) return notFound(res, 'Product not found');
    if (product.quantity < Number(quantity)) {
      return badRequest(res, `Insufficient stock. Available: ${product.quantity}`);
    }

    const before = product.quantity;
    product.quantity -= Number(quantity);
    await product.save();

    const movement = await StockMovement.create({
      productId: product._id,
      organizationId: orgId,
      type: 'OUT',
      quantity: Number(quantity),
      quantityBefore: before,
      quantityAfter:  product.quantity,
      note: note || null,
      performedBy: req.user._id,
    });

    await log({ userId: req.user._id, organizationId: orgId, action: 'STOCK_OUT', entity: 'Product', entityId: product._id, meta: { quantity, before, after: product.quantity } });
    emitToOrg(orgId.toString(), 'inventory:stock_changed', { product, movement });
    emitLowStock(orgId.toString(), product);
    emitToOrg(orgId.toString(), 'dashboard:stats_updated', {});

    return success(res, { product, movement }, `Stock reduced by ${quantity}`);
  } catch (err) {
    logger.error(`stockOut: ${err.message}`);
    throw err;
  }
};

/* ─── movement history ──────────────────────────────────────────────────────── */

const getMovements = async (req, res) => {
  const orgId = req.user.organizationId;
  const { page = 1, limit = 30 } = req.query;
  try {
    const filter = { organizationId: orgId };
    if (req.params.id) filter.productId = req.params.id;

    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate('performedBy', 'name phone')
        .populate('productId', 'name sku')
        .lean(),
      StockMovement.countDocuments(filter),
    ]);

    return success(res, { movements, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    logger.error(`getMovements: ${err.message}`);
    throw err;
  }
};

/* ─── metadata helpers ──────────────────────────────────────────────────────── */

const getCategories = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const categories = await Product.distinct('category', { organizationId: orgId, isActive: true, category: { $ne: null } });
    return success(res, { categories: categories.filter(Boolean).sort() });
  } catch (err) {
    logger.error(`getCategories: ${err.message}`);
    throw err;
  }
};

module.exports = {
  listProducts, getInventoryStats, getProduct,
  createProduct, updateProduct, deleteProduct,
  stockIn, stockOut, getMovements, getCategories,
};
