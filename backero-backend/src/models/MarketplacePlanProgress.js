const mongoose = require('mongoose');

const daySchema = new mongoose.Schema({
  checked:  [{ type: String }],
  kpi:      { type: mongoose.Schema.Types.Mixed, default: {} },
  notes:    { type: String, default: '' },
}, { _id: false });

const progressSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  platform:       { type: String, required: true },
  week:           { type: Number, required: true, min: 1, max: 52 },
  budget:         { type: String, default: '' },
  scorecard:      { type: mongoose.Schema.Types.Mixed, default: {} },
  days: {
    Mon: { type: daySchema, default: () => ({}) },
    Tue: { type: daySchema, default: () => ({}) },
    Wed: { type: daySchema, default: () => ({}) },
    Thu: { type: daySchema, default: () => ({}) },
    Fri: { type: daySchema, default: () => ({}) },
    Sat: { type: daySchema, default: () => ({}) },
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

progressSchema.index({ organizationId: 1, platform: 1, week: 1 }, { unique: true });

module.exports = mongoose.model('MarketplacePlanProgress', progressSchema);
