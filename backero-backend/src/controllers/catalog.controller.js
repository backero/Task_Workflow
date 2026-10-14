const CatalogProduct = require('../models/CatalogProduct');
const Product = require('../models/Product');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const { uploadBuffer } = require('../utils/cloudinary');

// GET /api/catalog/stats
exports.getStats = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const [total, active, discontinued, byCategory] = await Promise.all([
    CatalogProduct.countDocuments({ organizationId: orgId }),
    CatalogProduct.countDocuments({ organizationId: orgId, status: 'Active' }),
    CatalogProduct.countDocuments({ organizationId: orgId, status: 'Discontinued' }),
    CatalogProduct.aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);
  sendSuccess(res, { total, active, discontinued, byCategory });
});

// GET /api/catalog/products
exports.getProducts = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { search, category, status, limit = 500 } = req.query;
  const filter = { organizationId: orgId };
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (search) {
    const s = new RegExp(search, 'i');
    filter.$or = [{ name: s }, { code: s }, { category: s }, { hsnCode: s }, { barcode: s }];
  }
  const products = await CatalogProduct.find(filter)
    .select('code name category subCategory type unit weight gstRate hsnCode status image variants createdAt')
    .sort({ category: 1, name: 1 })
    .limit(Number(limit));
  sendSuccess(res, { products, total: products.length });
});

// GET /api/catalog/products/:id
exports.getProduct = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  sendSuccess(res, { product: p });
});

// POST /api/catalog/products
exports.createProduct = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const exists = await CatalogProduct.findOne({ organizationId: orgId, code: req.body.code?.toUpperCase?.() || req.body.code });
  if (exists) return sendError(res, 'SKU already exists: ' + req.body.code, 400);

  const p = await CatalogProduct.create({
    ...req.body,
    organizationId: orgId,
    createdBy: req.user._id,
    history: [{ action: 'Product created', detail: 'SKU: ' + req.body.code }],
    packaging: req.body.packaging || {
      items: [
        { name: 'Primary Box', qty: 1, rate: 0, amount: 0, optional: false },
        { name: 'Label', qty: 1, rate: 0, amount: 0, optional: true },
        { name: 'Bubble Wrap', qty: 1, rate: 0, amount: 0, optional: true },
        { name: 'Shipping Label', qty: 1, rate: 0, amount: 0, optional: false },
      ],
      charges: { machine: 0, shrinkWrap: 0, other: 0 },
    },
    marketplace: req.body.marketplace || {
      packaging: [
        { name: 'Primary Box', qty: 1, rate: 0, amount: 0, optional: false },
        { name: 'Label', qty: 1, rate: 0, amount: 0, optional: true },
        { name: 'Bubble Wrap', qty: 1, rate: 0, amount: 0, optional: true },
        { name: 'Shipping Label', qty: 1, rate: 0, amount: 0, optional: false },
      ],
      fees: {
        flipkart: { commission: 15, fixed: 30, shipping: 50, collection: 2 },
        amazon: { commission: 15, fixed: 40, shipping: 50, fba: 3 },
        meesho: { commission: 0, shipping: 70, collection: 0, penalty: 2 },
        snapdeal: { commission: 12, fixed: 20, shipping: 50, collection: 1.5 },
      },
      margins: { flipkart: 25, amazon: 25, meesho: 30, snapdeal: 25 },
    },
  });
  sendSuccess(res, { product: p }, 'Product created');
});

// PUT /api/catalog/products/:id
exports.updateProduct = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { ...req.body, updatedAt: new Date() },
    { new: true, runValidators: false }
  );
  if (!p) return sendError(res, 'Product not found', 404);
  sendSuccess(res, { product: p }, 'Product updated');
});

// DELETE /api/catalog/products/:id
exports.deleteProduct = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  sendSuccess(res, {}, 'Product deleted');
});

// POST /api/catalog/products/:id/image  (multipart)
exports.uploadImage = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  if (!req.file) return sendError(res, 'No file uploaded', 400);
  const result = await uploadBuffer(req.file.buffer, { folder: `backero/catalog/${req.user.organizationId}` });
  p.image = result.secure_url;
  await p.save();
  sendSuccess(res, { image: p.image }, 'Image uploaded');
});

const DOCUMENT_SLOTS = ['coa', 'msds', 'registration', 'brochure'];

// POST /api/catalog/products/:id/attachment  (multipart: file, kind)
// kind: 'rndDoc' | 'procedure' | 'documents.coa' | 'documents.msds' | 'documents.registration' | 'documents.brochure'
exports.uploadAttachment = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  if (!req.file) return sendError(res, 'No file uploaded', 400);
  const { kind } = req.body;

  const mime = req.file.mimetype || '';
  const resourceType = mime.startsWith('video/') || mime.startsWith('audio/') ? 'video' : mime.startsWith('image/') ? 'image' : 'raw';
  const result = await uploadBuffer(req.file.buffer, { folder: `backero/catalog/${req.user.organizationId}/attachments`, resourceType, filename: req.file.originalname });
  const attachment = { name: req.file.originalname, url: result.secure_url, type: mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document', createdAt: new Date() };

  if (kind === 'rndDoc') {
    if (!p.rndDoc) p.rndDoc = { text: '', attachments: [] };
    p.rndDoc.attachments.push(attachment);
    p.rndDoc.lastUpdated = new Date();
  } else if (kind === 'procedure') {
    if (!p.procedure) p.procedure = { text: '', attachments: [] };
    p.procedure.attachments.push(attachment);
    p.procedure.lastUpdated = new Date();
  } else if (kind?.startsWith('documents.')) {
    const slot = kind.split('.')[1];
    if (!DOCUMENT_SLOTS.includes(slot)) return sendError(res, 'Invalid document slot', 400);
    if (!p.documents) p.documents = {};
    p.documents[slot] = { name: req.file.originalname, url: result.secure_url, uploadedAt: new Date() };
  } else {
    return sendError(res, 'Invalid attachment kind', 400);
  }

  p.history.push({ action: 'Attachment uploaded', detail: `${kind}: ${req.file.originalname}` });
  await p.save();
  sendSuccess(res, { product: p }, 'Attachment uploaded');
});

// DELETE /api/catalog/products/:id/attachment  (body: { kind, attachmentId })
exports.removeAttachment = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  const { kind, attachmentId } = req.body;

  if (kind === 'rndDoc' && p.rndDoc?.attachments) {
    p.rndDoc.attachments = p.rndDoc.attachments.filter(a => String(a._id) !== String(attachmentId));
  } else if (kind === 'procedure' && p.procedure?.attachments) {
    p.procedure.attachments = p.procedure.attachments.filter(a => String(a._id) !== String(attachmentId));
  } else if (kind?.startsWith('documents.')) {
    const slot = kind.split('.')[1];
    if (!DOCUMENT_SLOTS.includes(slot)) return sendError(res, 'Invalid document slot', 400);
    if (p.documents) p.documents[slot] = undefined;
  } else {
    return sendError(res, 'Invalid attachment kind', 400);
  }

  await p.save();
  sendSuccess(res, { product: p }, 'Attachment removed');
});

// POST /api/catalog/products/:id/formulation-versions  (body: { changeNotes })
// Creates a new draft version cloned from the currently active (locked) formulation.
// Lazily seeds a "V1" locked version from the product's current `formulation` field
// the first time versioning is used, so pre-existing products need no migration.
// POST /api/catalog/products/:id/formulation-versions  (body: { changeNotes?, cloneFrom? })
// cloneFrom: a formulationVersions _id to clone rows/R&D docs from, or omitted to clone the
// live `formulation` + product-level rndDoc/researchGuide (the reference design's single
// "Clone to V(n+1)" action, which always clones whatever is currently selected/active).
exports.createFormulationVersion = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);

  if (!p.formulationVersions.length) {
    p.formulationVersions.push({
      versionLabel: 'V1',
      status: 'locked',
      refWeight: p.formulation?.refWeight || 100,
      refUnit: p.formulation?.refUnit || 'ml',
      rows: p.formulation?.rows || [],
      changeNotes: 'Initial formulation',
      rndDoc: { text: p.rndDoc?.text || '', attachments: p.rndDoc?.attachments || [] },
      researchGuide: { text: p.researchGuide?.text || '' },
      createdBy: req.user._id,
      activatedAt: p.createdAt || new Date(),
    });
  }

  const { cloneFrom } = req.body;
  const source = cloneFrom ? p.formulationVersions.id(cloneFrom) : null;
  const sourceLabel = source ? source.versionLabel : 'Live';

  const label = `V${p.formulationVersions.length + 1}`;
  p.formulationVersions.push({
    versionLabel: label,
    status: 'draft',
    refWeight: source ? source.refWeight : (p.formulation?.refWeight ?? 100),
    refUnit: source ? source.refUnit : (p.formulation?.refUnit ?? 'ml'),
    rows: source ? source.rows : (p.formulation?.rows || []),
    rndDoc: source
      ? { text: source.rndDoc?.text || '', attachments: source.rndDoc?.attachments || [] }
      : { text: p.rndDoc?.text || '', attachments: p.rndDoc?.attachments || [] },
    researchGuide: source ? { text: source.researchGuide?.text || '' } : { text: p.researchGuide?.text || '' },
    changeNotes: req.body.changeNotes || `Cloned from ${sourceLabel}`,
    createdBy: req.user._id,
  });
  p.history.push({ action: 'Formulation version created', detail: `${label} (cloned from ${sourceLabel})` });
  await p.save();
  sendSuccess(res, { product: p }, `${label} created`);
});

// PUT /api/catalog/products/:id/formulation-versions/:versionId  (body: { rows, refWeight, refUnit, changeNotes, status, rndDoc, researchGuide })
// Editing is only allowed while a version is draft/testing — locked/archived versions are frozen history.
exports.updateFormulationVersion = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  const version = p.formulationVersions.id(req.params.versionId);
  if (!version) return sendError(res, 'Version not found', 404);
  if (['locked', 'archived'].includes(version.status)) return sendError(res, 'Cannot edit a locked/archived version', 400);

  const { rows, refWeight, refUnit, changeNotes, status, rndDoc, researchGuide } = req.body;
  if (rows) version.rows = rows;
  if (refWeight !== undefined) version.refWeight = refWeight;
  if (refUnit) version.refUnit = refUnit;
  if (changeNotes !== undefined) version.changeNotes = changeNotes;
  if (status && ['draft', 'testing'].includes(status)) version.status = status;
  if (rndDoc !== undefined) version.rndDoc = { text: rndDoc.text ?? version.rndDoc?.text, attachments: version.rndDoc?.attachments || [] };
  if (researchGuide !== undefined) version.researchGuide = { text: researchGuide.text ?? version.researchGuide?.text };
  await p.save();
  sendSuccess(res, { product: p }, 'Version updated');
});

// POST /api/catalog/products/:id/formulation-versions/:versionId/activate
// Promotes a draft/testing version to locked+active, archives whichever version was previously
// locked, and copies its rows into the top-level `formulation` field so all existing cost-calc
// code (calcOverheadBreakdown etc.) keeps reading the active formulation unchanged.
exports.activateFormulationVersion = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  const version = p.formulationVersions.id(req.params.versionId);
  if (!version) return sendError(res, 'Version not found', 404);

  p.formulationVersions.forEach(v => { if (v.status === 'locked') v.status = 'archived'; });
  version.status = 'locked';
  version.activatedAt = new Date();
  p.formulation = { refWeight: version.refWeight, refUnit: version.refUnit, rows: version.rows };
  if (version.rndDoc) p.rndDoc = { text: version.rndDoc.text, attachments: version.rndDoc.attachments, lastUpdated: new Date() };
  if (version.researchGuide) p.researchGuide = { text: version.researchGuide.text, lastUpdated: new Date() };
  p.history.push({ action: 'Formulation version activated', detail: version.versionLabel });
  await p.save();
  sendSuccess(res, { product: p }, `${version.versionLabel} activated`);
});

// DELETE /api/catalog/products/:id/formulation-versions/:versionId
exports.deleteFormulationVersion = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  const version = p.formulationVersions.id(req.params.versionId);
  if (!version) return sendError(res, 'Version not found', 404);
  if (['locked', 'archived'].includes(version.status)) return sendError(res, 'Cannot delete a locked/archived version', 400);
  version.deleteOne();
  await p.save();
  sendSuccess(res, { product: p }, 'Version deleted');
});

// POST /api/catalog/products/:id/formulation-versions/:versionId/rnd-attachment  (multipart: file)
exports.uploadFormulationVersionRndAttachment = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  const version = p.formulationVersions.id(req.params.versionId);
  if (!version) return sendError(res, 'Version not found', 404);
  if (['locked', 'archived'].includes(version.status)) return sendError(res, `${version.versionLabel} is ${version.status} — clone to a new version to attach documents`, 400);
  if (!req.file) return sendError(res, 'No file uploaded', 400);

  const mime = req.file.mimetype || '';
  const resourceType = mime.startsWith('video/') || mime.startsWith('audio/') ? 'video' : mime.startsWith('image/') ? 'image' : 'raw';
  const result = await uploadBuffer(req.file.buffer, { folder: `backero/catalog/${req.user.organizationId}/attachments`, resourceType, filename: req.file.originalname });
  const attachment = { name: req.file.originalname, url: result.secure_url, type: mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document' };

  if (!version.rndDoc) version.rndDoc = { text: '', attachments: [] };
  version.rndDoc.attachments.push(attachment);
  p.history.push({ action: 'R&D attachment uploaded', detail: `${version.versionLabel}: ${req.file.originalname}` });
  await p.save();
  sendSuccess(res, { product: p }, 'Attachment uploaded');
});

// DELETE /api/catalog/products/:id/formulation-versions/:versionId/rnd-attachment  (body: { attachmentId })
exports.removeFormulationVersionRndAttachment = asyncHandler(async (req, res) => {
  const p = await CatalogProduct.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!p) return sendError(res, 'Product not found', 404);
  const version = p.formulationVersions.id(req.params.versionId);
  if (!version) return sendError(res, 'Version not found', 404);
  if (['locked', 'archived'].includes(version.status)) return sendError(res, `${version.versionLabel} is ${version.status} — read-only`, 400);

  version.rndDoc.attachments = (version.rndDoc?.attachments || []).filter((a) => String(a._id) !== String(req.body.attachmentId));
  await p.save();
  sendSuccess(res, { product: p }, 'Attachment removed');
});

// POST /api/catalog/import  — bulk import from localStorage JSON dump
exports.importProducts = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { products = [] } = req.body;
  if (!products.length) return sendError(res, 'No products provided', 400);

  let created = 0, skipped = 0;
  for (const raw of products) {
    const code = (raw.code || '').toUpperCase();
    if (!code || !raw.name || !raw.category) { skipped++; continue; }
    const exists = await CatalogProduct.findOne({ organizationId: orgId, code });
    if (exists) { skipped++; continue; }
    await CatalogProduct.create({
      organizationId: orgId,
      createdBy: req.user._id,
      code,
      name: raw.name,
      category: raw.category,
      subCategory: raw.subCategory || '',
      type: raw.type || '',
      unit: raw.unit || 'ml',
      weight: raw.weight || 0,
      gstRate: raw.gstRate || 18,
      hsnCode: raw.hsnCode || '',
      shelfLife: raw.shelfLife || 0,
      status: ['Active', 'Discontinued'].includes(raw.status) ? raw.status : 'Active',
      description: raw.description || '',
      storage: raw.storage || '',
      certifications: raw.certifications || '',
      barcode: raw.barcode || '',
      image: raw.image || null,
      formulation: raw.formulation || { refWeight: raw.weight || 100, refUnit: raw.unit || 'ml', rows: [] },
      variants: (raw.variants || []).map(v => ({
        name: v.name, weight: v.weight || 0, unit: v.unit || raw.unit || 'ml',
        stock: v.stock || 0, stockUnit: v.stockUnit || 'pcs',
        mrp: v.mrp || 0, sellingPrice: v.sellingPrice || 0, b2bPrice: v.b2bPrice || 0, costPrice: 0,
      })),
      history: [{ action: 'Imported from catalog', detail: 'SKU: ' + code }],
    });
    created++;
  }
  sendSuccess(res, { created, skipped }, `Imported ${created} products, skipped ${skipped}`);
});

// POST /api/catalog/resolve-ingredients
// Given a list of ingredient names, match to existing raw materials or create new ones.
// Returns enriched rows with rawMaterialId, unit, costPerKg and whether they were newly created.
exports.resolveIngredients = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { ingredients = [] } = req.body; // [{ name, unit, costPerKg }]

  const result = [];
  for (const ing of ingredients) {
    const name = (ing.name || '').trim();
    if (!name) continue;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let mat = await Product.findOne({
      organizationId: orgId,
      isRawMaterial: true,
      name: { $regex: new RegExp(`^${escaped}$`, 'i') },
    });

    let isNew = false;
    if (!mat) {
      const count = await Product.countDocuments({ organizationId: orgId, isRawMaterial: true });
      const sku = 'RM-' + String(count + 1).padStart(4, '0');
      mat = await Product.create({
        organizationId: orgId,
        name,
        sku,
        category: 'Raw Materials',
        unit: ing.unit || 'g',
        costPrice: ing.costPerKg || 0,
        currentStock: 0,
        isRawMaterial: true,
        isFinishedGood: false,
        isSellable: false,
        batches: [],
        createdBy: req.user._id,
      });
      isNew = true;
    }

    result.push({
      name: mat.name,
      rawMaterialId: mat._id.toString(),
      unit: mat.unit,
      costPerKg: ing.costPerKg || mat.costPrice || 0,
      isNew,
    });
  }

  sendSuccess(res, { ingredients: result });
});
