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

const productionOrderSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  orderNumber: { type: String, required: true },
  finishedProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  plannedQuantity: { type: Number, required: true },
  completedQuantity: { type: Number, default: 0 },
  rejectedQuantity: { type: Number, default: 0 },
  unit: { type: String, default: 'pcs' },
  batch: { type: String, required: true },
  status: { type: String, enum: Object.values(PRODUCTION_STATUS), default: PRODUCTION_STATUS.PLANNED, index: true },

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

  notes: { type: String },
  attachments: [{ url: String, name: String }],
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

productionOrderSchema.index({ organizationId: 1, status: 1 });
productionOrderSchema.index({ organizationId: 1, orderNumber: 1 }, { unique: true });

module.exports = mongoose.model('ProductionOrder', productionOrderSchema);
