const mongoose = require('mongoose');

const documentTrashSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  type: { type: String, enum: ['doc', 'file'], required: true },
  // type === 'doc': full document snapshot for restore
  doc: { type: mongoose.Schema.Types.Mixed },
  // type === 'file': the source document + version context, plus the file snapshot
  docId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  docName: { type: String },
  versionId: { type: mongoose.Schema.Types.ObjectId },
  versionLabel: { type: String },
  file: { type: mongoose.Schema.Types.Mixed },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: Date.now },
}, { timestamps: true });

documentTrashSchema.index({ organizationId: 1, deletedAt: -1 });

module.exports = mongoose.model('DocumentTrash', documentTrashSchema);
