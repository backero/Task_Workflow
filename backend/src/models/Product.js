const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: 200,
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    category: { type: String, trim: true, default: null },
    department: { type: String, trim: true, default: null },
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Quantity cannot be negative'],
      default: 0,
    },
    unitPrice: {
      type: Number,
      min: [0, 'Unit price cannot be negative'],
      default: 0,
    },
    minStockThreshold: {
      type: Number,
      min: [0, 'Threshold cannot be negative'],
      default: 0,
    },
    supplier: { type: String, trim: true, default: null },
    description:  { type: String, trim: true, default: null },
    productType: {
      type: String,
      enum: ['raw_material', 'component', 'finished_good', 'consumable'],
      default: 'finished_good',
    },
    unit: { type: String, trim: true, default: 'pcs' },
    bom: [{
      material:        { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      quantityPerUnit: { type: Number, required: true, min: 0.001 },
      unit:            { type: String, default: 'pcs' },
    }],
    isActive: { type: Boolean, default: true },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// SKU unique within org
productSchema.index({ sku: 1, organizationId: 1 }, { unique: true });
productSchema.index({ organizationId: 1, category: 1 });
productSchema.index({ organizationId: 1, isActive: 1 });

// Virtual: is low stock
productSchema.virtual('isLowStock').get(function () {
  return this.quantity <= this.minStockThreshold;
});

module.exports = mongoose.model('Product', productSchema);
