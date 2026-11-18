const mongoose = require('mongoose');

// The mirror is per organization. Amazon SP-API credentials never enter this
// collection; only the normalized, read-only seller capture is published.
const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  syncedAt: { type: Date, required: true },
});

module.exports = mongoose.model('AmazonSellerMirror', schema);
