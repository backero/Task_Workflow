const mongoose = require('mongoose');
const router = require('express').Router();
const ProductionOrder = require('../models/ProductionOrder');
const Product = require('../models/Product');
const CatalogProduct = require('../models/CatalogProduct');
const ProductionUsage = require('../models/ProductionUsage');
const StockMovement = require('../models/StockMovement');
const ActivityLog = require('../models/ActivityLog');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove, authorizeManagerOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { PRODUCTION_STATUS, STOCK_MOVEMENT_TYPES, SOCKET_EVENTS, BATCH_STAGE_TO_STATUS, BATCH_PROCESS_STEPS } = require('../utils/constants');
const { deductFIFO, recomputeStock, nextUsageNumber } = require('../services/inventory.service');
const User = require('../models/User');
const { createNotification } = require('../services/notification.service');

router.use(authenticate, orgIsolation);

// GET all production orders
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search } = req.query;
  const { skip } = paginate(page, limit);
  const filter = { organizationId: req.user.organizationId };
  if (status) filter.status = status;
  if (search) {
    const esc = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ orderNumber: { $regex: esc, $options: 'i' } }, { batch: { $regex: esc, $options: 'i' } }];
  }

  const [orders, total] = await Promise.all([
    ProductionOrder.find(filter)
      .populate('finishedProduct', 'name sku unit')
      .populate('catalogProduct', 'name code category')
      .populate('assignedTo', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    ProductionOrder.countDocuments(filter),
  ]);
  sendSuccess(res, paginateResponse(orders, total, page, limit));
}));

// POST create production order (manager+)
// Accepts an optional { catalogProduct, batchSizeKg } to auto-scale the recipe
// from the real Product Catalog formulation instead of a hand-typed BOM.
router.post('/', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const orgId = req.user.organizationId;
  const count = await ProductionOrder.countDocuments({ organizationId: orgId });
  const orderNumber = `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  const batch = `BATCH-${Date.now()}`;

  let ingredients = [];
  let catalogDoc = null;
  const { catalogProduct, batchSizeKg } = req.body;
  if (catalogProduct) {
    catalogDoc = await CatalogProduct.findOne({ _id: catalogProduct, organizationId: orgId });
    if (catalogDoc?.formulation?.rows?.length) {
      // formulation.rows quantities are per formulation.refWeight (assumed grams); scale to the target batch size in grams.
      const refWeight = catalogDoc.formulation.refWeight || 100;
      const targetGrams = (Number(batchSizeKg) || 0) * 1000;
      const scaleFactor = refWeight > 0 ? targetGrams / refWeight : 0;
      ingredients = catalogDoc.formulation.rows.map((r) => ({
        rawMaterialId: r.rawMaterialId || '',
        name: r.name,
        unit: r.unit || 'g',
        targetQty: Math.round((r.quantity || 0) * scaleFactor * 100) / 100,
      }));
    }
  }

  const order = await ProductionOrder.create({
    ...req.body,
    organizationId: orgId,
    orderNumber,
    batch,
    status: PRODUCTION_STATUS.PLANNED,
    // Stage 0 ("Order") is a permanently-editable info panel, not a gated step —
    // a new batch starts life actively sitting at stage 1 (Procurement).
    stage: 1,
    catalogProduct: catalogDoc?._id,
    ingredients,
    processSteps: BATCH_PROCESS_STEPS.map((name) => ({ name, done: false })),
    createdBy: req.user._id,
  });

  io?.to(`org:${orgId}`).emit(SOCKET_EVENTS.PRODUCTION_STARTED, { order });
  sendSuccess(res, { order }, 'Production order created', 201);
}));

// GET single production order
router.get('/:id', asyncHandler(async (req, res) => {
  const order = await ProductionOrder.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
    .populate('finishedProduct', 'name sku unit costPrice')
    .populate('catalogProduct')
    .populate('bom.product', 'name sku unit currentStock')
    .populate('assignedTo', 'firstName lastName avatar')
    .populate('qualityChecks.checkedBy', 'firstName lastName')
    .populate('ingredients.weighedBy', 'firstName lastName')
    .populate('processSteps.completedBy', 'firstName lastName');
  if (!order) return sendError(res, 'Production order not found.', 404);
  sendSuccess(res, { order });
}));

// PATCH update production status (manager+)
router.patch('/:id/status', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
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

    // Notify the assignee + Production department managers that the batch is done
    const recipientIds = new Set();
    if (order.assignedTo) recipientIds.add(String(order.assignedTo));
    const prodManagers = await User.find({
      organizationId: req.user.organizationId, department: 'Production', role: { $in: ['manager', 'admin', 'founder'] }, isActive: true,
    }).select('_id');
    prodManagers.forEach((m) => recipientIds.add(String(m._id)));

    for (const recipientId of recipientIds) {
      await createNotification({
        organizationId: req.user.organizationId,
        recipient: recipientId,
        title: '✅ Production Batch Completed',
        message: `Order ${order.orderNumber} (Batch ${order.batch}) completed — ${order.completedQuantity} unit(s) of ${finished?.name || 'product'} added to inventory.`,
        type: 'production', priority: 'medium',
        actionUrl: `/production/${order._id}`,
        reference: { model: 'ProductionOrder', id: order._id },
        channels: { inApp: true, whatsapp: true },
      }, io);
    }
  }

  await order.save();
  io?.to(`org:${req.user.organizationId}`).emit('production_updated', { orderId: order._id, status });
  sendSuccess(res, { order }, `Status updated to ${status}`);
}));

// POST add quality check
router.post('/:id/quality-check', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const { checkType, result, notes } = req.body;
  const order = await ProductionOrder.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!order) return sendError(res, 'Order not found.', 404);

  order.qualityChecks.push({ checkType, result, notes, checkedBy: req.user._id });
  order.qualityStatus = result;
  await order.save();
  sendSuccess(res, { order }, 'Quality check added');
}));

// DELETE production order (manager+, only if not completed)
router.delete('/:id', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const order = await ProductionOrder.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!order) return sendError(res, 'Production order not found.', 404);
  if (order.status === 'completed') return sendError(res, 'Cannot delete a completed production order.', 400);

  await order.deleteOne();
  sendSuccess(res, {}, 'Production order deleted');
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

// ── Batch Tracker — 8-stage detailed lifecycle ──────────────────────────────

const notifyStageChange = (req, order) => {
  req.app.get('io')?.to(`org:${req.user.organizationId}`).emit('production_updated', { orderId: order._id, stage: order.stage, status: order.status });
};

async function loadOrder(req, res) {
  const order = await ProductionOrder.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!order) { sendError(res, 'Production order not found.', 404); return null; }
  return order;
}

// PATCH Stage 0 — order/CRM spec edits
router.patch('/:id/order', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  const { customer, contact, container, priority, deliveryDate, notes, crmSpec, batchSizeKg, plannedQuantity } = req.body;
  if (customer !== undefined) order.customer = customer;
  if (contact !== undefined) order.contact = contact;
  if (container !== undefined) order.container = container;
  if (priority !== undefined) order.priority = priority;
  if (deliveryDate !== undefined) order.deliveryDate = deliveryDate;
  if (notes !== undefined) order.notes = notes;
  if (batchSizeKg !== undefined) order.batchSizeKg = batchSizeKg;
  if (plannedQuantity !== undefined) order.plannedQuantity = plannedQuantity;
  if (crmSpec !== undefined) order.crmSpec = { ...(order.crmSpec || {}), ...crmSpec };
  order.updatedBy = req.user._id;
  await order.save();
  sendSuccess(res, { order }, 'Order updated');
}));

// POST Stage 1 — confirm procurement (formula/RM availability confirmed), advance 1 -> 2
router.post('/:id/procurement/confirm', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  if (order.stage !== 1) return sendError(res, 'Order is not at the Procurement stage.', 400);
  order.stage = 2;
  order.status = BATCH_STAGE_TO_STATUS[2];
  order.updatedBy = req.user._id;
  await order.save();
  notifyStageChange(req, order);
  sendSuccess(res, { order }, 'Procurement confirmed');
}));

// PATCH Stage 2 — work assignment / schedule, advance 2 -> 3
router.patch('/:id/work-assignment', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  order.workAssignment = { ...(order.workAssignment?.toObject?.() || order.workAssignment || {}), ...req.body };
  if (order.stage === 2) { order.stage = 3; order.status = BATCH_STAGE_TO_STATUS[3]; }
  order.updatedBy = req.user._id;
  await order.save();
  notifyStageChange(req, order);
  sendSuccess(res, { order }, 'Work assignment saved');
}));

// POST Stage 3 — record one ingredient as weighed; FIFO-deducts real raw material
// stock and logs a linked ProductionUsage 'issue' record for audit trail.
router.post('/:id/weighing', asyncHandler(async (req, res) => {
  const { rawMaterialId, actualQty } = req.body;
  const order = await loadOrder(req, res);
  if (!order) return;
  const ing = order.ingredients.find((i) => i.rawMaterialId === rawMaterialId);
  if (!ing) return sendError(res, 'Ingredient not found on this order.', 404);
  const qty = Number(actualQty ?? ing.targetQty) || 0;

  if (rawMaterialId && mongoose.Types.ObjectId.isValid(rawMaterialId)) {
    const product = await Product.findOne({ _id: rawMaterialId, organizationId: req.user.organizationId, isRawMaterial: true });
    if (product) {
      const batchStock = (product.batches || []).reduce((s, b) => s + (b.quantity || 0), 0);
      const useBatches = batchStock >= qty;
      let deductions = [];
      if (useBatches) {
        deductions = deductFIFO(product, qty) || [];
        for (const d of deductions) {
          const b = product.batches.find((b) => b.batchId === d.batchId);
          if (b) b.quantity -= d.qty;
        }
        recomputeStock(product);
      } else if (product.currentStock >= qty) {
        product.currentStock -= qty;
      }
      await product.save();

      const issueNumber = await nextUsageNumber(req.user.organizationId, 'issue');
      await ProductionUsage.create({
        organizationId: req.user.organizationId,
        issueNumber, type: 'issue',
        materialId: product._id, materialCode: product.sku, materialName: product.name, unit: product.unit,
        quantity: qty, purpose: `Batch ${order.batch} — ${order.orderNumber}`,
        takenBy: req.user._id, productionOrderId: order._id, batchDeductions: deductions,
      });
    }
  }

  ing.actualQty = qty;
  ing.weighedBy = req.user._id;
  ing.weighedAt = new Date();
  order.updatedBy = req.user._id;
  await order.save();
  sendSuccess(res, { order }, 'Ingredient weighed');
}));

// POST Stage 3 — mark one of the 8 process steps complete
router.post('/:id/process-step', asyncHandler(async (req, res) => {
  const { index } = req.body;
  const order = await loadOrder(req, res);
  if (!order) return;
  const step = order.processSteps[index];
  if (!step) return sendError(res, 'Invalid step index.', 400);
  step.done = true;
  step.completedBy = req.user._id;
  step.completedAt = new Date();
  order.updatedBy = req.user._id;
  await order.save();
  sendSuccess(res, { order }, 'Step completed');
}));

// POST Stage 3 -> 4 — manual advance once all ingredients are weighed and all process steps are done
router.post('/:id/advance', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  if (order.stage !== 3) return sendError(res, 'Only the Weighing stage can be advanced this way.', 400);
  const allWeighed = order.ingredients.length > 0 && order.ingredients.every((i) => i.actualQty != null);
  const allStepsDone = order.processSteps.length > 0 && order.processSteps.every((s) => s.done);
  if (!allWeighed || !allStepsDone) return sendError(res, 'Complete all ingredient weighing and process steps first.', 400);
  order.stage = 4;
  order.status = BATCH_STAGE_TO_STATUS[4];
  order.updatedBy = req.user._id;
  await order.save();
  notifyStageChange(req, order);
  sendSuccess(res, { order }, 'Advanced to Bulk QC');
}));

// POST Stage 4 — Bulk QC result; PASS advances 4 -> 5, FAIL holds at stage 4
router.post('/:id/bulk-qc', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  const result = req.body.result === 'PASS' ? 'PASS' : 'FAIL';
  order.bulkQC = { ...req.body, result, checkedBy: req.user._id, checkedAt: new Date() };
  if (result === 'PASS') { order.stage = 5; order.status = BATCH_STAGE_TO_STATUS[5]; }
  order.updatedBy = req.user._id;
  await order.save();
  notifyStageChange(req, order);
  sendSuccess(res, { order }, result === 'PASS' ? 'Bulk QC passed' : 'Batch held at Bulk QC');
}));

// POST Stage 5 — Packaging complete, advance 5 -> 6
router.post('/:id/packaging', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  order.packaging = { ...req.body, completedBy: req.user._id, completedAt: new Date() };
  order.stage = 6;
  order.status = BATCH_STAGE_TO_STATUS[6];
  order.updatedBy = req.user._id;
  await order.save();
  notifyStageChange(req, order);
  sendSuccess(res, { order }, 'Packaging complete');
}));

// Maps a Job Sheet Final-QC spec key to the field it gates on the finalQC form.
const FQC_SPEC_TO_FIELD = {
  fqcWeight: { field: 'weightCheck', label: 'Weight Check' },
  fqcSeal: { field: 'sealCheck', label: 'Seal Integrity' },
  fqcLeak: { field: 'leakCheck', label: 'Leak Test' },
  fqcLabel: { field: 'labelCheck', label: 'Label Verification' },
  fqcPrint: { field: 'printCheck', label: 'Print Quality' },
  fqcCarton: { field: 'cartonCheck', label: 'Carton Condition' },
  fqcAppearance: { field: 'visualCheck', label: 'Appearance Check' },
};
const isSpecRequired = (crmSpec, key) => (crmSpec?.[`${key}Status`] || 'Required') === 'Required';

// POST Stage 6 — Final QC; approve advances 6 -> 7, credits finished-goods stock, notifies team
router.post('/:id/final-qc', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  const io = req.app.get('io');
  const approve = req.body.approve !== false;

  if (approve) {
    const missing = Object.entries(FQC_SPEC_TO_FIELD)
      .filter(([specKey]) => isSpecRequired(order.crmSpec, specKey))
      .filter(([, { field }]) => !req.body[field])
      .map(([, { label }]) => label);
    if (missing.length) return sendError(res, `Complete all Required checks: ${missing.join(', ')}`, 400);
  }

  order.finalQC = {
    weightCheck: req.body.weightCheck, visualCheck: req.body.visualCheck, labelCheck: req.body.labelCheck, sealCheck: req.body.sealCheck,
    leakCheck: req.body.leakCheck, printCheck: req.body.printCheck, cartonCheck: req.body.cartonCheck,
    comment: req.body.comment, checkedBy: req.user._id, checkedAt: new Date(),
  };

  if (approve) {
    order.stage = 7;
    order.status = BATCH_STAGE_TO_STATUS[7];
    order.actualEndDate = new Date();
    order.completedQuantity = order.packaging?.filled ? Math.max(0, order.packaging.filled - (order.packaging.rejected || 0)) : order.completedQuantity;

    if (order.finishedProduct) {
      const finished = await Product.findById(order.finishedProduct);
      if (finished) {
        const prevStock = finished.currentStock;
        finished.currentStock += order.completedQuantity || 0;
        await finished.save();
        await StockMovement.create({
          organizationId: req.user.organizationId, product: finished._id, type: STOCK_MOVEMENT_TYPES.PRODUCTION_OUTPUT,
          quantity: order.completedQuantity || 0, previousStock: prevStock, newStock: finished.currentStock, batch: order.batch,
          reference: { model: 'ProductionOrder', id: order._id, number: order.orderNumber }, createdBy: req.user._id,
        });
      }
    }

    const recipientIds = new Set();
    if (order.assignedTo) recipientIds.add(String(order.assignedTo));
    const prodManagers = await User.find({
      organizationId: req.user.organizationId, department: 'Production', role: { $in: ['manager', 'admin', 'founder'] }, isActive: true,
    }).select('_id');
    prodManagers.forEach((m) => recipientIds.add(String(m._id)));
    for (const recipientId of recipientIds) {
      await createNotification({
        organizationId: req.user.organizationId, recipient: recipientId,
        title: '✅ Final QC Approved', message: `Batch ${order.batch} (Order ${order.orderNumber}) passed Final QC and is ready for dispatch.`,
        type: 'production', priority: 'medium', actionUrl: '/production/batch-tracker',
        reference: { model: 'ProductionOrder', id: order._id }, channels: { inApp: true, whatsapp: true },
      }, io);
    }
  }

  order.updatedBy = req.user._id;
  await order.save();
  notifyStageChange(req, order);
  sendSuccess(res, { order }, approve ? 'Final QC approved' : 'Batch rejected / held');
}));

// POST Stage 7 — dispatch record
router.post('/:id/dispatch', authorizeManagerOrAbove, asyncHandler(async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  order.dispatchRecord = { ...req.body, dispatchedBy: req.user._id, dispatchedAt: new Date() };
  order.updatedBy = req.user._id;
  await order.save();
  notifyStageChange(req, order);
  sendSuccess(res, { order }, 'Batch dispatched');
}));

module.exports = router;
