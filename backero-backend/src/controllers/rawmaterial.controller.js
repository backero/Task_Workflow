const RawMaterial = require('../models/RawMaterial');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

function totalStock(m) {
  return (m.batches || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);
}
function stockStatus(m) {
  const qty = totalStock(m);
  if (qty <= 0) return 'Out';
  if (m.enableMinStock && qty <= (m.minStockLevel || 0)) return 'Low';
  return 'In';
}

exports.list = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { search, category, status } = req.query;
  const q = { organizationId: orgId };
  if (search) q.$or = [
    { name: new RegExp(search, 'i') },
    { code: new RegExp(search, 'i') },
    { supplier: new RegExp(search, 'i') },
  ];
  if (category && category !== 'All') q.category = category;
  const materials = await RawMaterial.find(q).sort({ code: 1 }).lean();
  const result = materials.map(m => ({ ...m, _totalStock: totalStock(m), _status: stockStatus(m) }));
  if (status && status !== 'All') {
    return sendSuccess(res, { materials: result.filter(m => m._status === status) });
  }
  sendSuccess(res, { materials: result });
});

exports.getStats = asyncHandler(async (req, res) => {
  const materials = await RawMaterial.find({ organizationId: req.user.organizationId }).lean();
  const statuses = materials.map(m => stockStatus(m));
  sendSuccess(res, {
    total:   materials.length,
    inStock: statuses.filter(s => s === 'In').length,
    low:     statuses.filter(s => s === 'Low').length,
    out:     statuses.filter(s => s === 'Out').length,
  });
});

exports.create = asyncHandler(async (req, res) => {
  const { _id, id, createdAt, updatedAt, _totalStock, _status, ...body } = req.body;
  const m = await RawMaterial.create({ ...body, organizationId: req.user.organizationId });
  sendSuccess(res, { material: m }, 201);
});

exports.update = asyncHandler(async (req, res) => {
  const { _id, id, organizationId, createdAt, updatedAt, _totalStock, _status, ...body } = req.body;
  const m = await RawMaterial.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { $set: body },
    { new: true, runValidators: true }
  );
  if (!m) return res.status(404).json({ success: false, message: 'Not found' });
  sendSuccess(res, { material: m });
});

exports.remove = asyncHandler(async (req, res) => {
  await RawMaterial.deleteOne({ _id: req.params.id, organizationId: req.user.organizationId });
  sendSuccess(res, { deleted: true });
});

exports.bulkImport = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { materials = [] } = req.body;
  if (!materials.length) return sendSuccess(res, { created: 0, skipped: 0 });
  let created = 0, skipped = 0;
  for (const raw of materials) {
    const { _id, id, createdAt, updatedAt, _totalStock, _status, ...body } = raw;
    const exists = await RawMaterial.findOne({ organizationId: orgId, code: body.code });
    if (exists) { skipped++; continue; }
    await RawMaterial.create({ ...body, organizationId: orgId });
    created++;
  }
  sendSuccess(res, { created, skipped });
});
