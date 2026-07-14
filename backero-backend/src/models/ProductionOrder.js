const mongoose = require('mongoose');
const { PRODUCTION_STATUS } = require('../utils/constants');

const bomItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  unit: { type: String },
  actualUsed: { type: Number, default: 0 },
  wasteQuantity: { type: Number, default: 0 },
});

const qualityCheckSchema = new mongoose.Schema({
  checkType: { type: String },
  result: { type: String, enum: ['pass', 'fail', 'conditional'], required: true },
  notes: { type: String },
  checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  checkedAt: { type: Date, default: Date.now },
  images: [{ type: String }],
});

const ingredientSchema = new mongoose.Schema({
  rawMaterialId: { type: String },
  name: { type: String },
  unit: { type: String, default: 'g' },
  targetQty: { type: Number, default: 0 },
  actualQty: { type: Number },
  weighedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  weighedAt: { type: Date },
  phase: { type: String },
  temp: { type: String },
}, { _id: false });

const processStepSchema = new mongoose.Schema({
  name: { type: String },
  done: { type: Boolean, default: false },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedAt: { type: Date },
}, { _id: false });

const workAssignmentSchema = new mongoose.Schema({
  startDate: String, endDate: String, weighDate: String, prodDate: String, packDate: String, qcDate: String, dispatchDate: String,
  weighPerson: String, prodPerson: String, qcPerson: String, packPerson: String, dispatchPerson: String, supervisor: String,
}, { _id: false });

const bulkQCSchema = new mongoose.Schema({
  ph: Number, viscosity: Number, density: Number, appearance: String, color: String, odor: String, texture: String,
  tpc: String, ym: String, pathogen: String, wld: Number, heavy: String, preservative: String, stability: String, docs: String,
  result: { type: String, enum: ['PASS', 'FAIL'] },
  checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  checkedAt: Date,
}, { _id: false });

const packagingSchema = new mongoose.Schema({
  mrp: Number, fillWeight: Number, filled: { type: Number, default: 0 }, rejected: { type: Number, default: 0 },
  mfgDate: String, expDate: String, batchCode: String, cartonQty: Number, totalCartons: Number,
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedAt: Date,
}, { _id: false });

const finalQCSchema = new mongoose.Schema({
  weightCheck: { type: String, enum: ['PASS', 'FAIL'] },
  visualCheck: { type: String, enum: ['PASS', 'FAIL'] },
  labelCheck: { type: String, enum: ['PASS', 'FAIL'] },
  sealCheck: { type: String, enum: ['PASS', 'FAIL'] },
  leakCheck: { type: String, enum: ['PASS', 'FAIL'] },
  printCheck: { type: String, enum: ['PASS', 'FAIL'] },
  cartonCheck: { type: String, enum: ['PASS', 'FAIL'] },
  comment: String,
  checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  checkedAt: Date,
}, { _id: false });

const dispatchRecordSchema = new mongoose.Schema({
  carrier: String, tracking: String, date: String, eta: String, notes: String,
  dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dispatchedAt: Date,
}, { _id: false });

const productionOrderSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  orderNumber: { type: String, required: true },
  finishedProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  plannedQuantity: { type: Number, default: 0 },
  completedQuantity: { type: Number, default: 0 },
  rejectedQuantity: { type: Number, default: 0 },
  unit: { type: String, default: 'pcs' },
  batch: { type: String, required: true },
  status: { type: String, enum: Object.values(PRODUCTION_STATUS), default: PRODUCTION_STATUS.PLANNED, index: true },

  // Batch Tracker (8-stage detailed lifecycle) ────────────────────────────────
  catalogProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct' },
  batchSizeKg: { type: Number },
  stage: { type: Number, default: 0, min: 0, max: 7, index: true },
  customer: String,
  contact: String,
  container: String,
  priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
  deliveryDate: String,
  notes: String,
  crmSpec: { type: mongoose.Schema.Types.Mixed, default: {} },
  ingredients: [ingredientSchema],
  workAssignment: workAssignmentSchema,
  processSteps: [processStepSchema],
  bulkQC: bulkQCSchema,
  packaging: packagingSchema,
  finalQC: finalQCSchema,
  dispatchRecord: dispatchRecordSchema,

  // BOM (Bill of Materials)
  bom: [bomItemSchema],

  // Timeline
  plannedStartDate: { type: Date },
  plannedEndDate: { type: Date },
  actualStartDate: { type: Date },
  actualEndDate: { type: Date },

  // Assignment
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  supervisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Quality
  qualityChecks: [qualityCheckSchema],
  qualityStatus: { type: String, enum: ['pending', 'passed', 'failed', 'conditional'], default: 'pending' },

  // Lab notes (R&D)
  labNotes: { type: String },
  formulaVersion: { type: String },

  // Packaging
  packagingNotes: { type: String },
  packagingCompleted: { type: Boolean, default: false },

  // Costs
  estimatedCost: { type: Number, default: 0 },
  actualCost: { type: Number, default: 0 },

  attachments: [{ url: String, name: String }],

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

productionOrderSchema.index({ organizationId: 1, status: 1 });
productionOrderSchema.index({ organizationId: 1, orderNumber: 1 }, { unique: true });

module.exports = mongoose.model('ProductionOrder', productionOrderSchema);
