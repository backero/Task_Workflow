const ProductionUsage = require('../models/ProductionUsage');

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

module.exports = { deductFIFO, recomputeStock, nextUsageNumber };
