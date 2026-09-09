const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  size: { type: Number, default: 0 },
  type: { type: String, default: '' },
  url: { type: String, default: '' },
  driveId: { type: String, default: '' },
  driveLink: { type: String, default: '' },
  label: { type: String, default: '' },
}, { _id: true, timestamps: true });

const versionSchema = new mongoose.Schema({
  v: { type: String, default: 'v1.0' },
  date: { type: String, default: '' },
  note: { type: String, default: '' },
  files: { type: [fileSchema], default: [] },
}, { _id: true, timestamps: true });

const customFieldSchema = new mongoose.Schema({
  key: { type: String, default: '' },
  value: { type: String, default: '' },
}, { _id: false });

const documentSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  docNo: { type: String, default: '' },
  issueDate: { type: Date },
  expiryDate: { type: Date },
  issuer: { type: String, default: '' },
  keeper: { type: String, default: '' },
  location: { type: String, default: '' },
  notes: { type: String, default: '' },
  customFields: { type: [customFieldSchema], default: [] },
  versions: { type: [versionSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

documentSchema.index({ organizationId: 1, expiryDate: 1 });
documentSchema.index({ organizationId: 1, category: 1 });

module.exports = mongoose.model('Document', documentSchema);
