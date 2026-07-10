const mongoose = require('mongoose');

const batchDeductionSchema = new mongoose.Schema({
  batchId:     { type: String },
  batchNumber: { type: String },
  qty:         { type: Number },
}, { _id: false });

const productionUsageSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  issueNumber:    { type: String, required: true },
  type:           { type: String, enum: ['issue', 'return'], required: true },
  materialId:     { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
  materialCode:   { type: String },
  materialName:   { type: String },
  unit:           { type: String },
  quantity:       { type: Number, required: true },
  purpose:        { type: String, default: '' },
  notes:          { type: String, default: '' },
  takenBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  returnOf:       { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionUsage', default: null },
  batchDeductions: { type: [batchDeductionSchema], default: [] },
}, { timestamps: true });

productionUsageSchema.index({ organizationId: 1, createdAt: -1 });
productionUsageSchema.index({ organizationId: 1, materialId: 1 });

module.exports = mongoose.model('ProductionUsage', productionUsageSchema);
