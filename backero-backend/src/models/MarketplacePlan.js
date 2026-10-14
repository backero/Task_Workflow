const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  { id: String, text: { type: String, required: true }, note: { type: String, default: '' } },
  { _id: false }
);

const dayTasksSchema = new mongoose.Schema(
  { Mon: [taskSchema], Tue: [taskSchema], Wed: [taskSchema], Thu: [taskSchema], Fri: [taskSchema], Sat: [taskSchema] },
  { _id: false }
);

const weekSchema = new mongoose.Schema(
  {
    week:       { type: Number, required: true },
    name:       { type: String, required: true },
    focus:      { type: String, default: '' },
    mustNonNeg: { type: String, default: '' },
    specific:   { type: dayTasksSchema, default: () => ({ Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [] }) },
  },
  { _id: false }
);

const marketplacePlanSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    platform:       { type: String, required: true },
    weeks:          [weekSchema],
    importedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

marketplacePlanSchema.index({ organizationId: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model('MarketplacePlan', marketplacePlanSchema);
