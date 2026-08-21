const mongoose = require('mongoose');

const productionQuerySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  leadName: { type: String },
  raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  askedVia: { type: String, enum: ['Phone Call', 'WhatsApp', 'Email', 'In-person', 'Other'], default: 'Phone Call' },
  urgency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  topic: { type: String, enum: ['General', 'Product', 'Packaging', 'Formula', 'Designing', 'Pricing'], default: 'General' },
  status: { type: String, enum: ['pending', 'in_progress', 'answered', 'closed'], default: 'pending', index: true },
  contactName: { type: String },
  contactEmail: { type: String },
  linkedCatalogProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct' },
  targetPrice: { type: Number },
  benchmarkNotes: { type: String },
  packagingIntent: { type: String },
  internalNotes: { type: String },
  preQueryStatus: { type: String },
  answer: { type: String },
  answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  answeredAt: { type: Date },
  // Product-first gating for the Q&A tab's convert-to-action icons (🧪 Sample / 🧬 Formula stay
  // locked until a product has been created/connected for this specific query) — points at a
  // subdocument _id inside Lead.productLinks, not a separate collection.
  linkedProductLinkId: { type: mongoose.Schema.Types.ObjectId },
  // Freeform label shown as the "→ converted" badge on the query card once it became a
  // product/sample/formula, e.g. "🧪 SMPL-F498-3".
  convertedTo: { type: String },
  // Files attached to the question itself, and separately to its reply — same shape as
  // Lead.customFormulas[].attachments (name/url/type), kept as two arrays since a query and its
  // answer are logged/edited at different times and a rep may want to attach evidence to either.
  attachments: [{ name: String, url: String, type: String }],
  answerAttachments: [{ name: String, url: String, type: String }],
  editedAt: { type: Date },
  // Soft delete — "Delete" strikes the card through instead of removing the record, so the
  // conversation history stays intact and the action is reversible.
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

productionQuerySchema.index({ organizationId: 1, status: 1 });
productionQuerySchema.index({ organizationId: 1, leadId: 1 });

module.exports = mongoose.model('ProductionQuery', productionQuerySchema);
