const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  product:          { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantityRequired: { type: Number, required: true, min: 0.01 },
  quantityUsed:     { type: Number, default: 0, min: 0 },
  unit:             { type: String, trim: true, default: 'pcs' },
}, { _id: true });

const productionOrderSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    orderNumber:    { type: String, required: true },
    name:           { type: String, required: true, trim: true, maxlength: 200 },
    outputProduct:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    outputQuantity: { type: Number, required: true, min: 0.01 },
    outputUnit:     { type: String, trim: true, default: 'pcs' },
    materials:      [materialSchema],
    status: {
      type: String,
      enum: ['draft', 'in_progress', 'completed', 'cancelled'],
      default: 'draft',
    },
    notes:       { type: String, trim: true, default: null },
    startedAt:   { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

productionOrderSchema.index({ organizationId: 1, orderNumber: 1 }, { unique: true });
productionOrderSchema.index({ organizationId: 1, status: 1 });
productionOrderSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('ProductionOrder', productionOrderSchema);
