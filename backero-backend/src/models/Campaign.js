const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true },
  department: { type: String, default: 'Marketing' },
  platform: { type: String, enum: ['Instagram', 'Facebook', 'YouTube', 'WhatsApp', 'Google', 'Email', 'Other'] },
  status: {
    type: String,
    enum: ['Idea', 'Script', 'Design', 'Review', 'Scheduled', 'Published', 'Performance Tracking', 'Completed', 'Cancelled'],
    default: 'Idea',
  },
  description: { type: String },
  objective: { type: String },
  targetAudience: { type: String },

  // Timeline
  startDate: { type: Date },
  endDate: { type: Date },
  publishedAt: { type: Date },

  // Budget
  budget: { type: Number, default: 0 },
  spent: { type: Number, default: 0 },

  // Performance
  metrics: {
    impressions: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    leads: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    cpc: { type: Number, default: 0 },
    roas: { type: Number, default: 0 },
  },

  // Team
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  managedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Assets
  attachments: [{ url: String, name: String, type: String }],
  contentCalendar: [{
    date: Date,
    platform: String,
    contentType: String,
    title: String,
    status: String,
    link: String,
  }],

  // Influencers
  influencers: [{
    name: String,
    handle: String,
    platform: String,
    followers: Number,
    rate: Number,
    status: String,
    deliverableUrl: String,
  }],

  tags: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

campaignSchema.index({ organizationId: 1, status: 1 });
campaignSchema.index({ organizationId: 1, platform: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);
