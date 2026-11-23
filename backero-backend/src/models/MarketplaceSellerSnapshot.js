const mongoose = require('mongoose');

// One organization-scoped, real daily reading from a seller mirror. The
// mirrors remain the latest-detail source; this collection is deliberately a
// compact, normalized history suitable for trend charts and comparisons.
const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  platform: { type: String, required: true, enum: ['amazon', 'flipkart', 'meesho', 'snapdeal'], index: true },
  date: { type: String, required: true }, // YYYY-MM-DD in India time
  capturedAt: { type: Date, required: true },
  source: { type: String, required: true },
  metrics: { type: Map, of: Number, default: {} },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ organizationId: 1, platform: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('MarketplaceSellerSnapshot', schema);
