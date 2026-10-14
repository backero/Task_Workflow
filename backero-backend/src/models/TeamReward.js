const mongoose = require('mongoose');

const teamRewardSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  department: { type: String, required: true },
  weekStart: { type: Date, required: true },
  weekEnd: { type: Date, required: true },

  memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  tasksChecked: { type: Number, default: 0 },

  status: { type: String, enum: ['pending', 'granted', 'skipped'], default: 'pending', index: true },

  rewardType: { type: String, enum: ['congrats_game', 'refreshments', 'early_leave'] },
  note: { type: String, maxlength: 500 },

  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  grantedAt: { type: Date },
}, { timestamps: true });

teamRewardSchema.index({ organizationId: 1, department: 1, weekStart: 1 }, { unique: true });
teamRewardSchema.index({ organizationId: 1, status: 1, weekStart: -1 });

module.exports = mongoose.model('TeamReward', teamRewardSchema);
