const ProductionUsage = require('../models/ProductionUsage');
const Product = require('../models/Product');
const { asyncHandler, sendSuccess } = require('../utils/helpers');
const { deductFIFO, recomputeStock, nextUsageNumber: nextNumber } = require('../services/inventory.service');

exports.list = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { materialId, type, limit = 200 } = req.query;
  const q = { organizationId: orgId };
  if (materialId) q.materialId = materialId;
  if (type) q.type = type;
  const records = await ProductionUsage.find(q)
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .populate('takenBy', 'firstName lastName role')
    .populate('returnOf', 'issueNumber quantity')
    .lean();
  sendSuccess(res, { records });
});

exports.recordIssue = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { materialId, quantity, purpose, notes } = req.body;

  if (!materialId || !quantity || Number(quantity) <= 0) {
    return res.status(400).json({ success: false, message: 'materialId and quantity are required' });
  }

  const product = await Product.findOne({ _id: materialId, organizationId: orgId, isRawMaterial: true });
  if (!product) return res.status(404).json({ success: false, message: 'Raw material not found' });

  const qty = Number(quantity);
  const batchStock = (product.batches || []).reduce((s, b) => s + (b.quantity || 0), 0);
  const useBatches = batchStock >= qty;

  // When stock was added via stockIn (not batch), batches may be empty/insufficient
  // but currentStock is correct — fall back to direct currentStock deduction
  if (!useBatches && product.currentStock < qty) {
    return res.status(400).json({ success: false, message: `Insufficient stock. Available: ${product.currentStock} ${product.unit}` });
  }

  let deductions = [];
  if (useBatches) {
    deductions = deductFIFO(product, qty);
    for (const d of deductions) {
      const batch = product.batches.find(b => b.batchId === d.batchId);
      if (batch) batch.quantity -= d.qty;
    }
    recomputeStock(product);
  } else {
    // No batch tracking — just deduct from currentStock
    product.currentStock -= qty;
  }
  await product.save();

  const issueNumber = await nextNumber(orgId, 'issue');
  const record = await ProductionUsage.create({
    organizationId: orgId,
    issueNumber,
    type:           'issue',
    materialId:     product._id,
    materialCode:   product.sku,
    materialName:   product.name,
    unit:           product.unit,
    quantity:       qty,
    purpose:        purpose || '',
    notes:          notes || '',
    takenBy:        req.user._id,
    batchDeductions: deductions,
  });

  const populated = await ProductionUsage.findById(record._id)
    .populate('takenBy', 'firstName lastName role')
    .lean();

  sendSuccess(res, { record: populated, material: product.toObject() }, 'Usage recorded', 201);
});

exports.recordReturn = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { quantity, notes } = req.body;

  const issueRecord = await ProductionUsage.findOne({ _id: req.params.id, organizationId: orgId, type: 'issue' });
  if (!issueRecord) return res.status(404).json({ success: false, message: 'Issue record not found' });

  const returns = await ProductionUsage.find({ returnOf: issueRecord._id, organizationId: orgId });
  const alreadyReturned = returns.reduce((s, r) => s + r.quantity, 0);
  const maxReturnable = issueRecord.quantity - alreadyReturned;
  const qty = Number(quantity);

  if (qty <= 0 || qty > maxReturnable) {
    return res.status(400).json({ success: false, message: `Max returnable: ${maxReturnable} ${issueRecord.unit}` });
  }

  const product = await Product.findOne({ _id: issueRecord.materialId, organizationId: orgId, isRawMaterial: true });
  if (!product) return res.status(404).json({ success: false, message: 'Raw material not found' });

  const returnDeductions = [];
  if (issueRecord.batchDeductions && issueRecord.batchDeductions.length > 0) {
    let remaining = qty;
    for (const d of issueRecord.batchDeductions) {
      if (remaining <= 0) break;
      const addBack = Math.min(d.qty, remaining);
      const batch = product.batches.find(b => b.batchId === d.batchId);
      if (batch) batch.quantity += addBack;
      returnDeductions.push({ batchId: d.batchId, batchNumber: d.batchNumber, qty: addBack });
      remaining -= addBack;
    }
    recomputeStock(product);
  } else {
    // No batch tracking on original issue — just add back to currentStock
    product.currentStock += qty;
  }
  await product.save();

  const issueNumber = await nextNumber(orgId, 'return');
  const record = await ProductionUsage.create({
    organizationId:  orgId,
    issueNumber,
    type:            'return',
    materialId:      product._id,
    materialCode:    product.sku,
    materialName:    product.name,
    unit:            product.unit,
    quantity:        qty,
    purpose:         issueRecord.purpose,
    notes:           notes || '',
    takenBy:         req.user._id,
    returnOf:        issueRecord._id,
    batchDeductions: returnDeductions,
  });

  const populated = await ProductionUsage.findById(record._id)
    .populate('takenBy', 'firstName lastName role')
    .populate('returnOf', 'issueNumber quantity')
    .lean();

  sendSuccess(res, { record: populated, material: product.toObject() }, 'Return recorded', 201);
});
