const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  batchId:      { type: String },
  batchNumber:  { type: String },
  quantity:     { type: Number, default: 0 },
  price:        { type: Number, default: 0 },
  receivedDate: { type: String },
  expiryDate:   { type: String },
  notes:        { type: String },
}, { _id: false });

const rawMaterialSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  code:           { type: String, required: true },
  name:           { type: String, required: true },
  hsnCode:        { type: String, default: '' },
  category:       { type: String, default: 'Raw Materials' },
  supplier:       { type: String, default: '' },
  location:       { type: String, default: '' },
  unit:           { type: String, default: 'kg' },
  unitPrice:      { type: Number, default: 0 },
  gstRate:        { type: Number, default: 18 },
  enableMinStock: { type: Boolean, default: false },
  minStockLevel:  { type: Number, default: 0 },
  qcPassed:       { type: Boolean, default: false },
  qcChecker:      { type: String, default: '' },
  qcNotes:        { type: String, default: '' },
  qcNumber:       { type: String, default: '' },
  batches:        { type: [batchSchema], default: [] },
}, { timestamps: true });

rawMaterialSchema.index({ organizationId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('RawMaterial', rawMaterialSchema);
