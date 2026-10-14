const mongoose = require('mongoose');

// Lightweight reusable customer directory for the Batch Tracker — lets a repeat
// customer's contact + Job Sheet spec checklist be picked instead of retyped
// on every new production order. Not the same as a CRM Lead (walk-in / direct
// production customers don't always come through the sales pipeline), but can
// optionally link to one when they do.
const productionCustomerSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  contact: { type: String },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  defaultContainer: { type: String },
  savedCrmSpec: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

productionCustomerSchema.index({ organizationId: 1, name: 1 });

module.exports = mongoose.model('ProductionCustomer', productionCustomerSchema);
