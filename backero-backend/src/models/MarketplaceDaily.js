const mongoose = require('mongoose');

const marketplaceDailySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  date:           { type: Date, required: true },
  totalSales:     { type: Number, default: 0 },
  ctr:            { type: Number, default: 0 },
  cvr:            { type: Number, default: 0 },
  adSpend:        { type: Number, default: 0 },
  adRevenue:      { type: Number, default: 0 },
  returns:        { type: Number, default: 0 },
  worstSkuCvr:    { type: Number, default: 0 },
  notes:          { type: String, default: '' },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

marketplaceDailySchema.index({ organizationId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('MarketplaceDaily', marketplaceDailySchema);
