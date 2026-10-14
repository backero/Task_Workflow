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
  // Every field here (including ph/viscosity/density) is a PASS/FAIL call against the Customer
  // Details spec shown alongside it, not a raw instrument reading — these were Number before,
  // switched to String to hold "PASS"/"FAIL" like the rest.
  ph: String, viscosity: String, density: String, appearance: String, color: String, odor: String, texture: String,
  tpc: String, ym: String, pathogen: String, wld: Number, heavy: String, preservative: String, stability: String, docs: String,
  // Every other Sensory/Physicochemical/QC-Plan spec key (qcAssay, labFreezeThaw, ...) that
  // doesn't have its own named column above — keyed by the same crmSpec key it was fetched
  // from, so the field list here can grow with Customer Details without another migration.
  extra: { type: mongoose.Schema.Types.Mixed, default: {} },
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
  // fqcRelease + any custom Final QC entries — same reasoning as bulkQCSchema.extra above.
  extra: { type: mongoose.Schema.Types.Mixed, default: {} },
  comment: String,
  checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  checkedAt: Date,
}, { _id: false });

const dispatchRecordSchema = new mongoose.Schema({
  carrier: String, tracking: String, date: String, eta: String, notes: String,
  // Confirmed once each box is ticked in the Dispatch stage's checklist, before Confirm Dispatch
  // is even clickable — kept on the record afterward as an audit trail of what was verified.
  checklist: {
    labelReady: { type: Boolean, default: false },
    invoiceReady: { type: Boolean, default: false },
    documentsReady: { type: Boolean, default: false },
  },
  dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dispatchedAt: Date,
}, { _id: false });

const productionOrderSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  orderNumber: { type: String, required: true },
  // Per-stage traceability IDs — {orderNumber}-{SUFFIX}, assigned the moment the order enters
  // that stage (see stageId() in productionWorkflow.service.js). Independent of `stage`/`status`
  // so a QC/paperwork reference stays fixed even if the order is later held or reworked.
  procurementId: { type: String },
  weighingId: { type: String },
  bulkQCId: { type: String },
  packagingId: { type: String },
  finalQCId: { type: String },
  finishedProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  plannedQuantity: { type: Number, default: 0 },
  completedQuantity: { type: Number, default: 0 },
  rejectedQuantity: { type: Number, default: 0 },
  unit: { type: String, default: 'pcs' },
  batch: { type: String, required: true },
  status: { type: String, enum: Object.values(PRODUCTION_STATUS), default: PRODUCTION_STATUS.PLANNED, index: true },

  // CRM origin — set when this batch was created from (or linked to) a Lead
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
  // Denormalized from the originating sample's quotation/invoice (per-product flow only) — lets
  // the work-assignment route check the ≥50% advance-payment gate in one lookup instead of
  // searching every lead's samples[] for the one pointing back at this order.
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },

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
