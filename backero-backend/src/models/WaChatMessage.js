const mongoose = require('mongoose');

// One WhatsApp message between a customer and one of our business numbers.
// Filled by Bounce Guard (the Meta webhook receiver) through POST /api/wa-chats/ingest.
const WaChatMessageSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    waMessageId: { type: String, required: true },   // WhatsApp's wamid
    business: { type: String, required: true },      // our number, digits only (918903790400)
    contact: { type: String, required: true },       // customer's number, digits only
    direction: { type: String, enum: ['in', 'out'], required: true },
    type: { type: String, default: 'text' },
    body: String,
    mediaId: String,
    sentAt: { type: Date, required: true },
    status: String,                                  // sent | delivered | read | failed | edited | deleted
    source: { type: String, enum: ['live', 'app', 'history'], default: 'live' }
  },
  { timestamps: true }
);

WaChatMessageSchema.index({ organizationId: 1, waMessageId: 1 }, { unique: true });
WaChatMessageSchema.index({ organizationId: 1, business: 1, contact: 1, sentAt: 1 });
WaChatMessageSchema.index({ organizationId: 1, sentAt: -1 });

module.exports = mongoose.model('WaChatMessage', WaChatMessageSchema);
