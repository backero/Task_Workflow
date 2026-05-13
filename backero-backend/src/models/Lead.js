const mongoose = require('mongoose');
const { LEAD_STATUS, LEAD_SOURCES } = require('../utils/constants');

const followUpSchema = new mongoose.Schema({
  scheduledAt: { type: Date, required: true },
  completedAt: { type: Date },
  type: { type: String, enum: ['call', 'whatsapp', 'meeting', 'email', 'demo', 'other'], default: 'call' },
  notes: { type: String },
  outcome: { type: String },
  nextAction: { type: String },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isCompleted: { type: Boolean, default: false },
}, { timestamps: true });

const leadSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

  // Contact info
  name: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, required: true },
  whatsapp: { type: String },
  company: { type: String },
  designation: { type: String },
  city: { type: String },
  state: { type: String },

  // Lead info
  source: { type: String, enum: Object.values(LEAD_SOURCES), default: LEAD_SOURCES.MANUAL },
  sourceDetails: { type: String },
  status: { type: String, enum: Object.values(LEAD_STATUS), default: LEAD_STATUS.NEW, index: true },
  pipeline: { type: String, default: 'default' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },

  // Product interest
  productInterest: [{ type: String }],
  estimatedValue: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  dealValue: { type: Number },

  // Assignment
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedAt: { type: Date },

  // Campaign / Ad tracking
  campaign: { type: String },
  adSet: { type: String },
  adId: { type: String },
  utmSource: { type: String },
  utmMedium: { type: String },

  // Timeline
  lastContactedAt: { type: Date },
  nextFollowUpAt: { type: Date, index: true },
  convertedAt: { type: Date },
  lostAt: { type: Date },
  lostReason: { type: String },

  // Follow-ups & Notes
  followUps: [followUpSchema],
  notes: { type: String },

  // Google Sheets sync
  sheetRowId: { type: String },
  sheetId: { type: String },
  lastSyncedAt: { type: Date },

  // Automation flags
  followUpReminders: { type: Number, default: 0 },
  lastReminderSent: { type: Date },
  isStale: { type: Boolean, default: false },

  // Conversion
  convertedToTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  isConverted: { type: Boolean, default: false },

  tags: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

leadSchema.index({ organizationId: 1, status: 1, assignedTo: 1 });
leadSchema.index({ organizationId: 1, phone: 1 });
leadSchema.index({ organizationId: 1, source: 1 });
leadSchema.index({ organizationId: 1, nextFollowUpAt: 1 });

module.exports = mongoose.model('Lead', leadSchema);
