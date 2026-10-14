const mongoose = require('mongoose');

const templateNodeSchema = new mongoose.Schema({
  nodeId:       { type: String, required: true },
  title:        { type: String, required: true },
  description:  { type: String },
  level:        { type: Number, default: 0 },
  parentNodeId: { type: String, default: null },
  estimatedHours: { type: Number },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical', 'urgent'], default: 'medium' },
  position: { x: { type: Number, default: 0 }, y: { type: Number, default: 0 } },
  dependencies: [{ type: String }],
}, { _id: false });

const workflowTemplateSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name:        { type: String, required: true, trim: true },
  description: { type: String },
  category:    { type: String },
  nodes:       [templateNodeSchema],
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isPublic:    { type: Boolean, default: false },
  usageCount:  { type: Number, default: 0 },
}, { timestamps: true });

workflowTemplateSchema.index({ organizationId: 1, category: 1 });

module.exports = mongoose.model('WorkflowTemplate', workflowTemplateSchema);
