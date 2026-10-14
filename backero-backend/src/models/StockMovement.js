const mongoose = require('mongoose');
const { STOCK_MOVEMENT_TYPES } = require('../utils/constants');

const stockMovementSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  type: { type: String, enum: Object.values(STOCK_MOVEMENT_TYPES), required: true },
  quantity: { type: Number, required: true },
  previousStock: { type: Number, required: true },
  newStock: { type: Number, required: true },
  unitPrice: { type: Number, default: 0 },
  totalValue: { type: Number, default: 0 },
  reference: {
    model: { type: String, enum: ['ProductionOrder', 'Invoice', 'Task', 'Manual'] },
    id: { type: mongoose.Schema.Types.ObjectId },
    number: { type: String },
  },
  notes: { type: String },
  batch: { type: String },
  expiryDate: { type: Date },
  warehouse: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

stockMovementSchema.index({ organizationId: 1, product: 1, createdAt: -1 });
stockMovementSchema.index({ organizationId: 1, type: 1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
