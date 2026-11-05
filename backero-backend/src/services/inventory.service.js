const ProductionUsage = require('../models/ProductionUsage');
const User = require('../models/User');
const { createNotification } = require('./notification.service');
const { DEPARTMENTS, ROLES } = require('../utils/constants');

// Deducts qty from a raw-material Product's batches, oldest received-date first.
// Returns the list of {batchId, batchNumber, qty} deductions, or null if the
// batches don't hold enough stock to cover qty.
function deductFIFO(product, qty) {
  const batches = [...(product.batches || [])].sort(
    (a, b) => new Date(a.receivedDate || 0) - new Date(b.receivedDate || 0)
  );
  const deductions = [];
  let remaining = qty;
  for (const batch of batches) {
    if (remaining <= 0) break;
    if ((batch.quantity || 0) <= 0) continue;
    const take = Math.min(batch.quantity, remaining);
    deductions.push({ batchId: batch.batchId, batchNumber: batch.batchNumber, qty: take });
    remaining -= take;
  }
  if (remaining > 0) return null;
  return deductions;
}

// Resyncs a Product's currentStock from the sum of its batches — call after
// mutating product.batches[].quantity directly.
function recomputeStock(product) {
  product.currentStock = product.batches.reduce((s, b) => s + (b.quantity || 0), 0);
}

// Shared PMI-#### / PMR-#### numbering used by ProductionUsage records,
// regardless of which flow (Record Usage page or Batch Tracker weighing) created them.
async function nextUsageNumber(orgId, type) {
  const prefix = type === 'issue' ? 'PMI' : 'PMR';
  const count = await ProductionUsage.countDocuments({ organizationId: orgId, type });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

// Alerts Production department managers + all admins (WhatsApp + in-app) the
// moment a product's stock crosses from above minStockLevel to at/below it.
// Pass the stock value from BEFORE this mutation as previousStock — fires only
// on the crossing, not on every subsequent deduction while already low.
async function notifyIfLowStockCrossed(product, previousStock, organizationId, io) {
  if (!product.enableMinStock) return;
  if (!(previousStock > product.minStockLevel && product.currentStock <= product.minStockLevel)) return;

  const recipients = await User.find({
    organizationId,
    isActive: true,
    $or: [
      { department: DEPARTMENTS.PRODUCTION, role: ROLES.MANAGER },
      { role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.FOUNDER, ROLES.CHAIRMAN] } },
    ],
  }).select('_id');

  const title = '⚠️ Low Stock Alert';
  const message = `${product.name} (${product.sku}) is low: ${product.currentStock} ${product.unit} left (min ${product.minStockLevel}).`;

  await Promise.all(recipients.map((u) => createNotification({
    organizationId,
    recipient: u._id,
    title,
    message,
    type: 'inventory',
    priority: 'high',
    actionUrl: `/inventory?product=${product._id}`,
    reference: { model: 'Product', id: product._id },
    channels: { inApp: true, whatsapp: true },
  }, io)));
}

module.exports = { deductFIFO, recomputeStock, nextUsageNumber, notifyIfLowStockCrossed };
