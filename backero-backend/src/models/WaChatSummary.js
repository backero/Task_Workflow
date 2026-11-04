const mongoose = require('mongoose');

// Last AI summary of a lead's WhatsApp chat. Regenerated on request when newer
// messages exist than the ones it was made from.
const WaChatSummarySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    text: { type: String, required: true },
    messageCount: Number,
    lastMessageAt: Date,                       // newest message included in the summary
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

WaChatSummarySchema.index({ organizationId: 1, leadId: 1 }, { unique: true });

module.exports = mongoose.model('WaChatSummary', WaChatSummarySchema);
