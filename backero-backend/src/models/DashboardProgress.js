const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  platform:       { type: String, required: true },
  data:           { type: Map, of: String, default: {} },
  updatedAt:      { type: Date, default: Date.now },
});

schema.index({ organizationId: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model('DashboardProgress', schema);
