const mongoose = require('mongoose');

// Customer names for WhatsApp chats: the WhatsApp profile name, or the name saved
// in the business phone's contacts (synced by Meta when the number is connected).
const WaChatContactSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    business: { type: String, required: true },
    contact: { type: String, required: true },
    name: String
  },
  { timestamps: true }
);

WaChatContactSchema.index({ organizationId: 1, business: 1, contact: 1 }, { unique: true });

module.exports = mongoose.model('WaChatContact', WaChatContactSchema);
