const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  syncedAt: { type: Date, required: true },
});

module.exports = mongoose.model('FlipkartSellerMirror', schema);
