const mongoose = require('mongoose');

const ProductHistorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CatalogProduct',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userName: String,
    tabName: {
      type: String,
      enum: ['Overview', 'Formulation & Procedure', 'R&D Price Calculator', 'Product Overheads', 'Marketplace', 'QR Code', 'Documents', 'History'],
      required: true
    },
    fieldName: {
      type: String,
      required: true
    },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    changeDescription: String,
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization'
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

ProductHistorySchema.index({ productId: 1, timestamp: -1 });

module.exports = mongoose.model('ProductHistory', ProductHistorySchema);
