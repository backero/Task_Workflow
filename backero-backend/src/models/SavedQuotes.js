const mongoose = require('mongoose');

const SavedQuotesSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CatalogProduct',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    date: {
      type: String,
      required: true
    },
    data: {
      formulation: mongoose.Schema.Types.Mixed,
      productionOverhead: mongoose.Schema.Types.Mixed,
      standardAssumptions: mongoose.Schema.Types.Mixed,
      rnd: mongoose.Schema.Types.Mixed,
      containers: mongoose.Schema.Types.Mixed,
      packaging: mongoose.Schema.Types.Mixed,
      costing: mongoose.Schema.Types.Mixed,
      selectedBatch: mongoose.Schema.Types.Mixed,
      batchUnit: mongoose.Schema.Types.Mixed
    },
    total: {
      type: Number,
      default: 0
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SavedQuotes', SavedQuotesSchema);
