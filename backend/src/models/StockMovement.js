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
      enum: ['IN', 'OUT', 'ADJUSTMENT'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Movement quantity must be at least 1'],
    },
    quantityBefore: { type: Number, required: true },
    quantityAfter:  { type: Number, required: true },
    note: { type: String, trim: true, default: null },
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
