const Document = require('../models/Document');
const DocumentTrash = require('../models/DocumentTrash');
const Organization = require('../models/Organization');
const { asyncHandler, sendSuccess, sendError, slugify } = require('../utils/helpers');
const drive = require('../services/googleDrive.service');
const { computeDueDocsForOrg, runDocumentExpiryRemindersForOrg, maybeSeedDocumentWallet } = require('../services/documentWallet.service');

const toDateOrUndefined = (v) => (v ? new Date(v) : undefined);

// Collect every driveId referenced by a trash entry (doc-level snapshots carry
// a whole document's versions/files; file-level entries carry just one file).
function collectDriveIds(trashItem) {
  const ids = [];
  if (trashItem.type === 'doc' && trashItem.doc) {
    for (const v of trashItem.doc.versions || []) {
      for (const f of v.files || []) {
        if (f.driveId) ids.push(f.driveId);
      }
    }
  } else if (trashItem.type === 'file' && trashItem.file?.driveId) {
    ids.push(trashItem.file.driveId);
  }
  return ids;
}

// ── Documents ────────────────────────────────────────────────────────────

exports.list = asyncHandler(async (req, res) => {
  await maybeSeedDocumentWallet(req.user.organizationId, req.user._id);
  const documents = await Document.find({ organizationId: req.user.organizationId }).sort({ name: 1 }).lean();
  sendSuccess(res, { documents });
});

exports.getOne = asyncHandler(async (req, res) => {
  const document = await Document.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!document) return sendError(res, 'Document not found', 404);
  sendSuccess(res, { document });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, category, docNo, issueDate, expiryDate, issuer, keeper, location, notes, customFields } = req.body;
  if (!name || !category) return sendError(res, 'name and category are required', 400);

  const document = await Document.create({
    organizationId: req.user.organizationId,
    name, category,
    docNo: docNo || '',
    issueDate: toDateOrUndefined(issueDate),
    expiryDate: toDateOrUndefined(expiryDate),
    issuer: issuer || '', keeper: keeper || '', location: location || '', notes: notes || '',
    customFields: Array.isArray(customFields) ? customFields : [],
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  sendSuccess(res, { document }, 'Document created', 201);
});

exports.update = asyncHandler(async (req, res) => {
  const { name, category, docNo, issueDate, expiryDate, issuer, keeper, location, notes, customFields } = req.body;
  const $set = { updatedBy: req.user._id };
  if (name !== undefined) $set.name = name;
  if (category !== undefined) $set.category = category;
  if (docNo !== undefined) $set.docNo = docNo;
  if (issueDate !== undefined) $set.issueDate = toDateOrUndefined(issueDate) || null;
  if (expiryDate !== undefined) $set.expiryDate = toDateOrUndefined(expiryDate) || null;
  if (issuer !== undefined) $set.issuer = issuer;
  if (keeper !== undefined) $set.keeper = keeper;
  if (location !== undefined) $set.location = location;
  if (notes !== undefined) $set.notes = notes;
  if (Array.isArray(customFields)) $set.customFields = customFields;

  const document = await Document.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { $set },
    { new: true, runValidators: true },
  );
  if (!document) return sendError(res, 'Document not found', 404);
  sendSuccess(res, { document });
});

exports.softDelete = asyncHandler(async (req, res) => {
  const document = await Document.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!document) return sendError(res, 'Document not found', 404);

  await DocumentTrash.create({
    organizationId: req.user.organizationId,
    type: 'doc',
    doc: document.toObject(),
    deletedBy: req.user._id,
  });
  await Document.deleteOne({ _id: document._id });
  sendSuccess(res, { deleted: true });
});

// ── Categories ───────────────────────────────────────────────────────────

exports.getCategories = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organizationId).select('documentCategories').lean();
  sendSuccess(res, { categories: org?.documentCategories || [] });
});

exports.addCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return sendError(res, 'Category name is required', 400);

  const org = await Organization.findById(req.user.organizationId);
  if (!org) return sendError(res, 'Organization not found', 404);

  const existingIds = new Set((org.documentCategories || []).map((c) => c.id));
  let id = slugify(name);
  let suffix = 2;
  while (existingIds.has(id)) id = `${slugify(name)}-${suffix++}`;

  org.documentCategories = [...(org.documentCategories || []), { id, name: name.trim() }];
  await org.save();
  sendSuccess(res, { categories: org.documentCategories }, 'Category added', 201);
});

exports.deleteCategory = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organizationId);
  if (!org) return sendError(res, 'Organization not found', 404);
  org.documentCategories = (org.documentCategories || []).filter((c) => c.id !== req.params.catId);
  await org.save();
  sendSuccess(res, { categories: org.documentCategories });
});

// ── Trash / recycle bin ─────────────────────────────────────────────────

exports.listTrash = asyncHandler(async (req, res) => {
  const trash = await DocumentTrash.find({ organizationId: req.user.organizationId }).sort({ deletedAt: -1 }).lean();
  sendSuccess(res, { trash });
});

exports.restoreTrash = asyncHandler(async (req, res) => {
  const item = await DocumentTrash.findOne({ _id: req.params.trashId, organizationId: req.user.organizationId });
  if (!item) return sendError(res, 'Trash item not found', 404);

  if (item.type === 'doc') {
    const { _id, __v, createdAt, updatedAt, ...docData } = item.doc || {};
    const restored = await Document.create({ ...docData, organizationId: req.user.organizationId, updatedBy: req.user._id });
    await DocumentTrash.deleteOne({ _id: item._id });
    return sendSuccess(res, { document: restored }, 'Document restored');
  }

  const document = await Document.findOne({ _id: item.docId, organizationId: req.user.organizationId });
  if (!document) return sendError(res, 'Original document no longer exists', 404);

  let version = item.versionId ? document.versions.id(item.versionId) : null;
  if (!version) {
    document.versions.push({ v: item.versionLabel || 'v1.0', date: '', note: 'Restored from Recycle Bin', files: [] });
    version = document.versions[document.versions.length - 1];
  }
  version.files.push(item.file);
  document.updatedBy = req.user._id;
  await document.save();
  await DocumentTrash.deleteOne({ _id: item._id });
  sendSuccess(res, { document }, 'File restored');
});

exports.purgeTrash = asyncHandler(async (req, res) => {
  const item = await DocumentTrash.findOne({ _id: req.params.trashId, organizationId: req.user.organizationId });
  if (!item) return sendError(res, 'Trash item not found', 404);

  for (const driveId of collectDriveIds(item)) await drive.deleteFile(driveId);
  await DocumentTrash.deleteOne({ _id: item._id });
  sendSuccess(res, { purged: true });
});

exports.emptyTrash = asyncHandler(async (req, res) => {
  const items = await DocumentTrash.find({ organizationId: req.user.organizationId });
  for (const item of items) {
    for (const driveId of collectDriveIds(item)) await drive.deleteFile(driveId);
  }
  await DocumentTrash.deleteMany({ organizationId: req.user.organizationId });
  sendSuccess(res, { purged: items.length });
});

// ── Files (Google Drive) ────────────────────────────────────────────────

// Verifies a Drive file id belongs to this org before any Drive operation —
// the original single-tenant app had no such check since it only had one tenant.
async function assertDriveIdInOrg(driveId, organizationId) {
  const owned = await Document.exists({ organizationId, 'versions.files.driveId': driveId });
  if (owned) return true;
  const trashed = await DocumentTrash.exists({
    organizationId,
    $or: [{ type: 'file', 'file.driveId': driveId }, { type: 'doc', 'doc.versions.files.driveId': driveId }],
  });
  return !!trashed;
}

exports.streamFile = asyncHandler(async (req, res) => {
  const ok = await assertDriveIdInOrg(req.params.driveId, req.user.organizationId);
  if (!ok) return sendError(res, 'File not found', 404);
  try {
    await drive.streamFile(req.params.driveId, res);
  } catch (err) {
    sendError(res, err.message, 502);
  }
});

// Uploads a file directly onto an *existing* document, as its first version if
// none exist yet, otherwise appended to the latest version.
exports.uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, 'No file uploaded', 400);
  const document = await Document.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!document) return sendError(res, 'Document not found', 404);
  if (!drive.hasWriteCredentials()) return sendError(res, 'Document storage is not configured yet.', 503);

  const org = await Organization.findById(req.user.organizationId).select('name').lean();
  let uploaded;
  try {
    uploaded = await drive.uploadBuffer(req.file.buffer, {
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      orgFolderName: org?.name,
      categoryName: document.category,
      docName: document.name,
    });
  } catch (err) {
    return sendError(res, `Upload failed: ${err.message}`, 502);
  }

  const fileEntry = {
    name: req.file.originalname,
    size: req.file.size,
    type: req.file.mimetype,
    url: `/api/documents/files/${uploaded.driveId}/content`,
    driveId: uploaded.driveId,
    driveLink: uploaded.driveLink,
  };

  if (!document.versions.length) {
    document.versions.push({ v: 'v1.0', date: new Date().toISOString().slice(0, 10), note: 'Initial upload', files: [fileEntry] });
  } else {
    document.versions[document.versions.length - 1].files.push(fileEntry);
  }
  document.updatedBy = req.user._id;
  await document.save();
  sendSuccess(res, { document, file: fileEntry }, 'File uploaded', 201);
});

exports.addVersion = asyncHandler(async (req, res) => {
  const document = await Document.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!document) return sendError(res, 'Document not found', 404);

  const { v, date, note, expiryDate } = req.body;
  document.versions.push({ v: v || `v${document.versions.length + 1}.0`, date: date || '', note: note || '', files: [] });
  if (expiryDate !== undefined) document.expiryDate = toDateOrUndefined(expiryDate) || null;
  document.updatedBy = req.user._id;
  await document.save();
  sendSuccess(res, { document }, 'Version added', 201);
});

exports.deleteVersionFile = asyncHandler(async (req, res) => {
  const document = await Document.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!document) return sendError(res, 'Document not found', 404);

  const version = document.versions.id(req.params.versionId);
  if (!version) return sendError(res, 'Version not found', 404);
  const file = version.files.id(req.params.fileId);
  if (!file) return sendError(res, 'File not found', 404);

  await DocumentTrash.create({
    organizationId: req.user.organizationId,
    type: 'file',
    docId: document._id,
    docName: document.name,
    versionId: version._id,
    versionLabel: version.v,
    file: file.toObject(),
    deletedBy: req.user._id,
  });

  version.files.pull(file._id);
  document.updatedBy = req.user._id;
  await document.save();
  sendSuccess(res, { document }, 'File moved to Recycle Bin');
});

// ── Reminders ────────────────────────────────────────────────────────────

exports.remindersPreview = asyncHandler(async (req, res) => {
  const threshold = parseInt(req.query.days || process.env.DOCUMENT_REMINDER_DAYS || '30', 10);
  const due = await computeDueDocsForOrg(req.user.organizationId, threshold);
  sendSuccess(res, due);
});

exports.remindersSendNow = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organizationId);
  if (!org) return sendError(res, 'Organization not found', 404);
  const io = req.app.get('io');
  const result = await runDocumentExpiryRemindersForOrg(org, { force: true, io });
  sendSuccess(res, result, 'Reminder digest sent');
});
