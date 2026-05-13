const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    type: {
      type: String,
      enum: ['IN', 'OUT', 'ADJUSTMENT', 'SALE', 'PRODUCTION_USE', 'PRODUCTION_OUTPUT', 'QUALITY_TEST'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [0.01, 'Movement quantity must be positive'],
    },
    quantityBefore: { type: Number, required: true },
    quantityAfter:  { type: Number, required: true },
    note:        { type: String, trim: true, default: null },
    reference:   { type: String, trim: true, default: null },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

stockMovementSchema.index({ productId: 1, createdAt: -1 });
stockMovementSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
