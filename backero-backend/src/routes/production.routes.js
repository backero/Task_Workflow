const router = require('express').Router();
const ProductionOrder = require('../models/ProductionOrder');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const ActivityLog = require('../models/ActivityLog');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { PRODUCTION_STATUS, STOCK_MOVEMENT_TYPES, SOCKET_EVENTS } = require('../utils/constants');

router.use(authenticate, orgIsolation);

// GET all production orders
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search } = req.query;
  const { skip } = paginate(page, limit);
  const filter = { organizationId: req.user.organizationId };
  if (status) filter.status = status;
  if (search) filter.$or = [{ orderNumber: { $regex: search, $options: 'i' } }, { batch: { $regex: search, $options: 'i' } }];

  const [orders, total] = await Promise.all([
    ProductionOrder.find(filter)
      .populate('finishedProduct', 'name sku unit')
      .populate('assignedTo', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    ProductionOrder.countDocuments(filter),
  ]);
  sendSuccess(res, paginateResponse(orders, total, page, limit));
}));

// POST create production order
router.post('/', asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const count = await ProductionOrder.countDocuments({ organizationId: req.user.organizationId });
  const orderNumber = `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  const batch = `BATCH-${Date.now()}`;

  const order = await ProductionOrder.create({
    ...req.body,
    organizationId: req.user.organizationId,
    orderNumber,
    batch,
    status: PRODUCTION_STATUS.PLANNED,
    createdBy: req.user._id,
  });

  io?.to(`org:${req.user.organizationId}`).emit(SOCKET_EVENTS.PRODUCTION_STARTED, { order });
  sendSuccess(res, { order }, 'Production order created', 201);
}));

// GET single production order
router.get('/:id', asyncHandler(async (req, res) => {
  const order = await ProductionOrder.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
    .populate('finishedProduct', 'name sku unit costPrice')
    .populate('bom.product', 'name sku unit currentStock')
    .populate('assignedTo', 'firstName lastName avatar')
    .populate('qualityChecks.checkedBy', 'firstName lastName');
  if (!order) return sendError(res, 'Production order not found.', 404);
  sendSuccess(res, { order });
}));

// PATCH update production status
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  const io = req.app.get('io');

  const order = await ProductionOrder.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!order) return sendError(res, 'Order not found.', 404);

  const prevStatus = order.status;
  order.status = status;
  order.updatedBy = req.user._id;

  if (status === PRODUCTION_STATUS.IN_PRODUCTION && prevStatus === PRODUCTION_STATUS.MATERIAL_ALLOCATED) {
    order.actualStartDate = new Date();
    // Deduct raw materials from inventory
    for (const item of order.bom) {
      const product = await Product.findById(item.product);
      if (product) {
        const prevStock = product.currentStock;
        product.currentStock = Math.max(0, product.currentStock - item.quantity);
        await product.save();
        await StockMovement.create({
          organizationId: req.user.organizationId,
          product: item.product,
          type: STOCK_MOVEMENT_TYPES.PRODUCTION_USE,
          quantity: -item.quantity,
          previousStock: prevStock,
          newStock: product.currentStock,
          reference: { model: 'ProductionOrder', id: order._id, number: order.orderNumber },
          createdBy: req.user._id,
        });
      }
    }
  }

  if (status === PRODUCTION_STATUS.COMPLETED) {
    order.actualEndDate = new Date();
    order.completedQuantity = order.plannedQuantity;
    // Add finished goods to inventory
    const finished = await Product.findById(order.finishedProduct);
    if (finished) {
      const prevStock = finished.currentStock;
      finished.currentStock += order.completedQuantity;
      await finished.save();
      await StockMovement.create({
        organizationId: req.user.organizationId,
        product: order.finishedProduct,
        type: STOCK_MOVEMENT_TYPES.PRODUCTION_OUTPUT,
        quantity: order.completedQuantity,
        previousStock: prevStock,
        newStock: finished.currentStock,
        batch: order.batch,
        reference: { model: 'ProductionOrder', id: order._id, number: order.orderNumber },
        createdBy: req.user._id,
      });
    }
  }

  await order.save();
  io?.to(`org:${req.user.organizationId}`).emit('production_updated', { orderId: order._id, status });
  sendSuccess(res, { order }, `Status updated to ${status}`);
}));

// POST add quality check
router.post('/:id/quality-check', asyncHandler(async (req, res) => {
  const { checkType, result, notes } = req.body;
  const order = await ProductionOrder.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!order) return sendError(res, 'Order not found.', 404);

  order.qualityChecks.push({ checkType, result, notes, checkedBy: req.user._id });
  order.qualityStatus = result;
  await order.save();
  sendSuccess(res, { order }, 'Quality check added');
}));

// GET analytics
router.get('/stats/overview', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const stats = await ProductionOrder.aggregate([
    { $match: { organizationId: orgId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  sendSuccess(res, { stats });
}));

module.exports = router;
