const mongoose = require('mongoose');

const followUpQueueSchema = new mongoose.Schema(
  {
    leadId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    phone:          { type: String, required: true },
    leadName:       { type: String, default: '' },
    message:        { type: String, required: true },
    sendAt:         { type: Date, required: true },
    status:         { type: String, enum: ['pending', 'sent', 'failed', 'cancelled'], default: 'pending' },
    attempt:        { type: Number, default: 0 },
    sequenceTag:    { type: String, default: null }, // e.g. 'New_day2', 'Lost_day30'
  },
  { timestamps: true }
);

followUpQueueSchema.index({ status: 1, sendAt: 1 });
followUpQueueSchema.index({ leadId: 1, status: 1 });

module.exports = mongoose.model('FollowUpQueue', followUpQueueSchema);
