const mongoose = require('mongoose');

const productionQuerySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  leadName: { type: String },
  raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  urgency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['pending', 'answered', 'closed'], default: 'pending', index: true },
  preQueryStatus: { type: String },
  answer: { type: String },
  answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  answeredAt: { type: Date },
}, { timestamps: true });

productionQuerySchema.index({ organizationId: 1, status: 1 });
productionQuerySchema.index({ organizationId: 1, leadId: 1 });

module.exports = mongoose.model('ProductionQuery', productionQuerySchema);
