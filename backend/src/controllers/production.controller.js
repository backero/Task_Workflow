const ProductionOrder = require('../models/ProductionOrder');
const Product         = require('../models/Product');
const StockMovement   = require('../models/StockMovement');
const { success, created, notFound, badRequest } = require('../utils/response');
const { log }         = require('../services/activityLog.service');
const { emitToOrg }   = require('../sockets/index');
const { sendProductionStarted, sendProductionCompleted } = require('../services/whatsapp.service');
const logger          = require('../utils/logger');

const POPULATE_ORDER = [
  { path: 'outputProduct',       select: 'name sku quantity unit' },
  { path: 'materials.product',   select: 'name sku quantity unit' },
  { path: 'createdBy',           select: 'name phone' },
];

const nextOrderNumber = async (orgId) => {
  const count = await ProductionOrder.countDocuments({ organizationId: orgId });
  return `PRD-${String(count + 1).padStart(4, '0')}`;
};

const moveStock = async ({ productId, orgId, qty, type, note, referenceId, reference, userId }) => {
  const product = await Product.findOne({ _id: productId, organizationId: orgId });
  if (!product) throw new Error(`Product not found: ${productId}`);
  const before = product.quantity;
  const after  = type === 'PRODUCTION_OUTPUT' ? before + qty : Math.max(0, before - qty);
  await Product.findByIdAndUpdate(productId, { $set: { quantity: after } });
  await StockMovement.create({
    productId, organizationId: orgId, type, quantity: qty,
    quantityBefore: before, quantityAfter: after,
    note, reference, referenceId, performedBy: userId,
  });
};

/* ─── List ─────────────────────────────────────────────────────────────────── */

const listOrders = async (req, res) => {
  const orgId = req.user.organizationId;
  const { status, page = 1, limit = 20 } = req.query;
  try {
    const filter = { organizationId: orgId };
    if (status) filter.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      ProductionOrder.find(filter)
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
        .populate(POPULATE_ORDER)
        .lean(),
      ProductionOrder.countDocuments(filter),
    ]);
    return success(res, { orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    logger.error(`listOrders: ${err.message}`);
    throw err;
  }
};

const getOrder = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const order = await ProductionOrder.findOne({ _id: req.params.id, organizationId: orgId })
      .populate(POPULATE_ORDER).lean();
    if (!order) return notFound(res, 'Production order not found');
    return success(res, { order });
  } catch (err) {
    logger.error(`getOrder: ${err.message}`);
    throw err;
  }
};

/* ─── Stats ─────────────────────────────────────────────────────────────────── */

const getStats = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const rows = await ProductionOrder.aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const map = rows.reduce((a, r) => { a[r._id] = r.count; return a; }, {});
    return success(res, {
      total:       (map.draft || 0) + (map.in_progress || 0) + (map.completed || 0) + (map.cancelled || 0),
      draft:       map.draft       || 0,
      in_progress: map.in_progress || 0,
      completed:   map.completed   || 0,
      cancelled:   map.cancelled   || 0,
    });
  } catch (err) {
    logger.error(`getStats: ${err.message}`);
    throw err;
  }
};

/* ─── Create ────────────────────────────────────────────────────────────────── */

const createOrder = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const orderNumber = await nextOrderNumber(orgId);
    const order = await ProductionOrder.create({
      ...req.body,
      orderNumber,
      organizationId: orgId,
      createdBy: req.user._id,
    });
    const populated = await ProductionOrder.findById(order._id).populate(POPULATE_ORDER).lean();
    await log({ userId: req.user._id, organizationId: orgId, action: 'PRODUCTION_ORDER_CREATED', entity: 'ProductionOrder', entityId: order._id });
    emitToOrg(orgId.toString(), 'production:order_created', { order: populated });
    return created(res, { order: populated }, 'Production order created');
  } catch (err) {
    logger.error(`createOrder: ${err.message}`);
    throw err;
  }
};

/* ─── Start ─────────────────────────────────────────────────────────────────── */

const startOrder = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const order = await ProductionOrder.findOne({ _id: req.params.id, organizationId: orgId })
      .populate('materials.product', 'name sku quantity');
    if (!order) return notFound(res, 'Order not found');
    if (order.status !== 'draft') return badRequest(res, 'Only draft orders can be started');

    // Pre-check all material stock levels before deducting anything
    for (const mat of order.materials) {
      if (!mat.product || mat.quantityRequired <= 0) continue;
      if (mat.product.quantity < mat.quantityRequired) {
        return badRequest(res,
          `Insufficient stock for "${mat.product.name}". Available: ${mat.product.quantity} ${mat.unit}, Required: ${mat.quantityRequired} ${mat.unit}`
        );
      }
    }

    // Deduct all raw materials
    for (const mat of order.materials) {
      if (!mat.product || mat.quantityRequired <= 0) continue;
      await moveStock({
        productId: mat.product._id, orgId,
        qty: mat.quantityRequired,
        type: 'PRODUCTION_USE',
        note: `Used in Production Order ${order.orderNumber}`,
        referenceId: order._id, reference: order.orderNumber,
        userId: req.user._id,
      });
      mat.quantityUsed = mat.quantityRequired;
    }

    order.status    = 'in_progress';
    order.startedAt = new Date();
    await order.save();

    const populated = await ProductionOrder.findById(order._id).populate(POPULATE_ORDER).lean();
    await log({ userId: req.user._id, organizationId: orgId, action: 'PRODUCTION_STARTED', entity: 'ProductionOrder', entityId: order._id });
    emitToOrg(orgId.toString(), 'production:order_updated', { order: populated });
    emitToOrg(orgId.toString(), 'inventory:stock_updated', {});
    if (req.user.phone) {
      sendProductionStarted(req.user.phone, req.user.name || req.user.phone, order.name, order.orderNumber)
        .catch(e => logger.error(`WA productionStarted: ${e.message}`));
    }
    return success(res, { order: populated }, 'Production started — raw materials deducted from inventory');
  } catch (err) {
    logger.error(`startOrder: ${err.message}`);
    throw err;
  }
};

/* ─── Complete ──────────────────────────────────────────────────────────────── */

const completeOrder = async (req, res) => {
  const orgId = req.user.organizationId;
  const { actualQuantity } = req.body;
  try {
    const order = await ProductionOrder.findOne({ _id: req.params.id, organizationId: orgId });
    if (!order) return notFound(res, 'Order not found');
    if (order.status !== 'in_progress') return badRequest(res, 'Only in-progress orders can be completed');

    const qty = Number(actualQuantity) > 0 ? Number(actualQuantity) : order.outputQuantity;

    if (order.outputProduct) {
      await moveStock({
        productId: order.outputProduct, orgId,
        qty,
        type: 'PRODUCTION_OUTPUT',
        note: `Finished goods from Production Order ${order.orderNumber}`,
        referenceId: order._id, reference: order.orderNumber,
        userId: req.user._id,
      });
    }

    order.status      = 'completed';
    order.completedAt = new Date();
    order.outputQuantity = qty;
    await order.save();

    const populated = await ProductionOrder.findById(order._id).populate(POPULATE_ORDER).lean();
    await log({ userId: req.user._id, organizationId: orgId, action: 'PRODUCTION_COMPLETED', entity: 'ProductionOrder', entityId: order._id });
    emitToOrg(orgId.toString(), 'production:order_updated', { order: populated });
    emitToOrg(orgId.toString(), 'inventory:stock_updated', {});
    if (req.user.phone) {
      sendProductionCompleted(req.user.phone, req.user.name || req.user.phone, order.name, order.orderNumber, qty, order.outputUnit || 'pcs')
        .catch(e => logger.error(`WA productionCompleted: ${e.message}`));
    }
    return success(res, { order: populated }, `Production completed — ${qty} units added to inventory`);
  } catch (err) {
    logger.error(`completeOrder: ${err.message}`);
    throw err;
  }
};

/* ─── Cancel ────────────────────────────────────────────────────────────────── */

const cancelOrder = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const order = await ProductionOrder.findOne({ _id: req.params.id, organizationId: orgId });
    if (!order) return notFound(res, 'Order not found');
    if (order.status === 'completed') return badRequest(res, 'Completed orders cannot be cancelled');

    order.status = 'cancelled';
    await order.save();

    await log({ userId: req.user._id, organizationId: orgId, action: 'PRODUCTION_CANCELLED', entity: 'ProductionOrder', entityId: order._id });
    emitToOrg(orgId.toString(), 'production:order_updated', { order });
    return success(res, { order }, 'Order cancelled');
  } catch (err) {
    logger.error(`cancelOrder: ${err.message}`);
    throw err;
  }
};

/* ─── Quality Test ──────────────────────────────────────────────────────────── */

const recordQualityTest = async (req, res) => {
  const orgId = req.user.organizationId;
  const { productId, quantity, notes } = req.body;
  try {
    if (!productId || !quantity || Number(quantity) <= 0) {
      return badRequest(res, 'Product and a positive quantity are required');
    }
    const product = await Product.findOne({ _id: productId, organizationId: orgId });
    if (!product) return notFound(res, 'Product not found');
    if (product.quantity < Number(quantity)) {
      return badRequest(res, `Insufficient stock. Available: ${product.quantity}`);
    }

    const before = product.quantity;
    const after  = before - Number(quantity);
    await Product.findByIdAndUpdate(productId, { $set: { quantity: after } });
    await StockMovement.create({
      productId, organizationId: orgId,
      type: 'QUALITY_TEST',
      quantity: Number(quantity),
      quantityBefore: before, quantityAfter: after,
      note: notes || 'Quality test sample',
      performedBy: req.user._id,
    });

    await log({ userId: req.user._id, organizationId: orgId, action: 'QUALITY_TEST_RECORDED', entity: 'Product', entityId: productId });
    emitToOrg(orgId.toString(), 'inventory:stock_updated', {});
    return success(res, { product: { _id: productId, name: product.name, newQuantity: after } }, `${quantity} units taken for quality test`);
  } catch (err) {
    logger.error(`recordQualityTest: ${err.message}`);
    throw err;
  }
};

/* ─── Stock-In Raw Material (from production floor) ─────────────────────────── */

const stockInRawMaterial = async (req, res) => {
  const orgId = req.user.organizationId;
  const { productId, newProduct, quantity, note } = req.body;
  try {
    if (!quantity || Number(quantity) <= 0) return badRequest(res, 'Quantity must be positive');

    let product;

    if (productId) {
      // Add stock to existing product
      product = await Product.findOne({ _id: productId, organizationId: orgId });
      if (!product) return notFound(res, 'Product not found');
    } else if (newProduct) {
      // Create new raw material / chemical in inventory
      const { name, sku, unit = 'kg', category = 'Raw Material', supplier, description } = newProduct;
      if (!name || !sku) return badRequest(res, 'Product name and SKU are required');

      const existing = await Product.findOne({ sku: sku.toUpperCase(), organizationId: orgId });
      if (existing) return badRequest(res, `SKU "${sku.toUpperCase()}" already exists`);

      product = await Product.create({
        name, sku: sku.toUpperCase(), unit, category,
        supplier: supplier || null,
        description: description || null,
        productType: 'raw_material',
        quantity: 0,
        organizationId: orgId,
        createdBy: req.user._id,
      });
    } else {
      return badRequest(res, 'Provide productId or newProduct details');
    }

    const before = product.quantity;
    const after  = before + Number(quantity);
    await Product.findByIdAndUpdate(product._id, { $set: { quantity: after } });
    await StockMovement.create({
      productId: product._id, organizationId: orgId,
      type: 'IN', quantity: Number(quantity),
      quantityBefore: before, quantityAfter: after,
      note: note || `Stock received via production floor`,
      performedBy: req.user._id,
    });

    emitToOrg(orgId.toString(), 'inventory:stock_updated', {});
    await log({ userId: req.user._id, organizationId: orgId, action: 'PRODUCTION_STOCK_IN', entity: 'Product', entityId: product._id });

    const updated = await Product.findById(product._id).lean();
    return success(res, { product: updated }, `${quantity} ${product.unit} of "${product.name}" added to inventory`);
  } catch (err) {
    logger.error(`stockInRawMaterial: ${err.message}`);
    throw err;
  }
};

/* ─── Ad-hoc Material Usage ─────────────────────────────────────────────────── */

const adHocMaterialUsage = async (req, res) => {
  const orgId = req.user.organizationId;
  const { productId, quantity, note } = req.body;
  try {
    if (!productId) return badRequest(res, 'productId is required');
    if (!quantity || Number(quantity) <= 0) return badRequest(res, 'Quantity must be positive');

    const product = await Product.findOne({ _id: productId, organizationId: orgId });
    if (!product) return notFound(res, 'Product not found');
    if (product.quantity < Number(quantity)) {
      return badRequest(res, `Insufficient stock. Available: ${product.quantity} ${product.unit}`);
    }

    const before = product.quantity;
    const after  = before - Number(quantity);
    await Product.findByIdAndUpdate(productId, { $set: { quantity: after } });
    await StockMovement.create({
      productId, organizationId: orgId,
      type: 'PRODUCTION_USE', quantity: Number(quantity),
      quantityBefore: before, quantityAfter: after,
      note: note || 'Ad-hoc usage from production floor',
      performedBy: req.user._id,
    });

    emitToOrg(orgId.toString(), 'inventory:stock_updated', {});
    await log({ userId: req.user._id, organizationId: orgId, action: 'PRODUCTION_ADHOC_USAGE', entity: 'Product', entityId: productId });

    // Low stock check
    if (after <= product.minStockThreshold) {
      emitToOrg(orgId.toString(), 'inventory:low_stock_alert', {
        productId: product._id, name: product.name, quantity: after, minStockThreshold: product.minStockThreshold,
      });
    }

    const updated = await Product.findById(productId).lean();
    return success(res, { product: updated }, `${quantity} ${product.unit} of "${product.name}" deducted from inventory`);
  } catch (err) {
    logger.error(`adHocMaterialUsage: ${err.message}`);
    throw err;
  }
};

module.exports = { listOrders, getOrder, getStats, createOrder, startOrder, completeOrder, cancelOrder, recordQualityTest, stockInRawMaterial, adHocMaterialUsage };
