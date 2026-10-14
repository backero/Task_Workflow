const mongoose = require('mongoose');

const leadActivitySchema = new mongoose.Schema(
  {
    leadId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: {
      type: String,
      enum: ['created', 'stage_change', 'note_added', 'whatsapp_sent', 'followup_sent',
             'assigned', 'production_created', 'stale_alert', 'value_changed', 'bulk_whatsapp'],
      required: true,
    },
    description: { type: String, required: true },
    by:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

leadActivitySchema.index({ leadId: 1, createdAt: -1 });

module.exports = mongoose.model('LeadActivity', leadActivitySchema);
