const mongoose = require('mongoose');

const STAGES  = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const SOURCES = ['WhatsApp', 'GoogleSheet', 'Manual', 'Import'];

const leadSchema = new mongoose.Schema(
  {
    name:            { type: String, required: true, trim: true },
    phone:           { type: String, required: true, trim: true },
    email:           { type: String, default: null, lowercase: true, trim: true },
    company:         { type: String, default: null, trim: true },
    query:           { type: String, default: null },
    source:          { type: String, enum: SOURCES, default: 'Manual' },
    stage:           { type: String, enum: STAGES, default: 'New' },
    value:           { type: Number, default: 0 },
    notes:           { type: String, default: null },
    tags:            [String],
    assignedTo:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    organizationId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    sheetRowId:      { type: String, default: null },
    lastContactedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

leadSchema.index({ organizationId: 1, stage: 1 });
leadSchema.index({ organizationId: 1, phone: 1 }, { unique: true });
leadSchema.index({ organizationId: 1, sheetRowId: 1 }, { sparse: true });
leadSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('Lead', leadSchema);
