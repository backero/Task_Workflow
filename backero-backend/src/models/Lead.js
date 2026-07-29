const mongoose = require('mongoose');
const { LEAD_STATUS, LEAD_SOURCES } = require('../utils/constants');

const sampleLogSchema = new mongoose.Schema({
  text: { type: String, required: true },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  postedAt: { type: Date, default: Date.now },
}, { _id: true });

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
  phone2: { type: String },
  whatsapp: { type: String },
  company: { type: String },
  designation: { type: String },
  city: { type: String },
  state: { type: String },
  businessType: { type: String },
  preferredName: { type: String },
  language: { type: String },
  bestTime: { type: String },
  teamSize: { type: String },
  rapportNote: { type: String },

  // Lead info
  source: { type: String, default: LEAD_SOURCES.MANUAL },
  sourceDetails: { type: String },
  status: { type: String, default: LEAD_STATUS.NEW, index: true },
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

  // In Progress updates
  lastUpdateText: { type: String },
  lastUpdateAt: { type: Date },

  // Lead time (dispatch deadline)
  leadTime: { type: Number },        // days to dispatch from inProgressAt
  inProgressAt: { type: Date },      // when status moved to In Progress

  // Sample stage details
  sampleDetails: {
    // Rich intake form data (set when moving to Sample stage)
    discussion: { type: String },
    sampleProducts: [{
      name: { type: String },
      quantity: { type: Number },
      sampleSize: { type: Number },
      unit: { type: String, default: 'ml' },
      bottleReq: { type: Boolean, default: false },
      bottleDetails: { type: String },
      labelReq: { type: Boolean, default: false },
      labelDetails: { type: String },
      labReq: { type: Boolean, default: false },
      labDetails: { type: String },
      individualPacking: { type: String },
    }],
    shippingAddress: { type: String },
    outerCartonRequired: { type: Boolean, default: false },
    outerCartonSize: { type: String },
    // Work tracking
    workStarted: { type: Boolean, default: false },
    workStartedAt: { type: Date },
    // Sample sub-stage pipeline: Requested -> In Lab -> Sent -> Feedback -> Approved/Rejected
    subStage: { type: String, enum: ['Requested', 'In Lab', 'Sent', 'Feedback', 'Approved', 'Rejected'], default: 'Requested' },
    subStageHistory: [{
      subStage: { type: String },
      enteredAt: { type: Date, default: Date.now },
      movedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }],
    rejectionReason: { type: String },
    // Legacy / dispatch tracking fields
    product: { type: String },
    quantity: { type: Number },
    sentDate: { type: Date },
    courier: { type: String },
    chargeAmount: { type: Number, default: 0 },
    chargeBy: { type: String, enum: ['client', 'company'], default: 'client' },
    paymentStatus: { type: String, enum: ['pending', 'full_paid'], default: 'pending' },
    advanceAmount: { type: Number, default: 0 },
    paymentMode: { type: String, enum: ['cash', 'upi', 'bank_transfer'], default: 'upi' },
    images: [{ url: String, name: String, addedAt: { type: Date, default: Date.now } }],
    teamUpdates: [sampleLogSchema],
    clientNotes: [sampleLogSchema],
    preparationDays: { type: Number },
    startedAt: { type: Date },
    financeTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    sampleInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  },

  // Custom formulas developed for this customer (Sample Development — Formulas tab).
  // Rows reference real Raw Material stock (Product docs with isRawMaterial:true) the same
  // way CatalogProduct.formulation does, so cost/unit is computed from real material cost,
  // not typed in by hand.
  customFormulas: [{
    formulaId: { type: String },
    name: { type: String },
    productLink: { type: String },
    refWeight: { type: Number, default: 100 },
    refUnit: { type: String, enum: ['g', 'kg', 'ml', 'L'], default: 'g' },
    currentVersion: { type: Number, default: 1 },
    versions: [{
      version: { type: Number },
      status: { type: String, enum: ['Draft', 'In Testing', 'Accepted', 'Rejected', 'Archived'], default: 'In Testing' },
      costPerUnit: { type: Number, default: 0 },
      procedure: { type: String },
      rows: [{
        rawMaterialId: { type: String },
        name: { type: String },
        quantity: { type: Number, default: 0 },
        unit: { type: String, default: 'g' },
        costPerUnit: { type: Number, default: 0 },
        phase: { type: String },
        notes: { type: String },
        conv: { type: Number, default: 1 },
      }],
      createdAt: { type: Date, default: Date.now },
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  }],

  // Products & pricing linked to this customer (Sample Development — Products tab).
  // catalogProductId is set when picked from the real Product Catalog; productId/name
  // stay free-text-friendly for products not yet in the catalog.
  productLinks: [{
    productId: { type: String },
    catalogProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct' },
    name: { type: String },
    basis: { type: String, enum: ['House Formula', 'Client Provided', 'Catalog SKU'], default: 'House Formula' },
    approxPrice: { type: Number, default: 0 },
    priceStatus: { type: String, enum: ['Pending', 'Accepted', 'Rejected'], default: 'Pending' },
    paymentStatus: { type: String, enum: ['pending', 'full_paid'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  }],

  // Versioned, chainable samples (Sample Development — Samples tab). A rejected sample can
  // spawn a new version via `chainedFrom`. `sampleDetails.subStage` mirrors the latest one here
  // so the existing Sample Production queue/stat cards keep working unchanged.
  samples: [{
    sampleId: { type: String },
    formulaId: { type: String },
    version: { type: Number, default: 1 },
    chainedFrom: { type: String },
    status: { type: String, enum: ['Requested', 'In Lab', 'Sent', 'Feedback', 'Approved', 'Rejected'], default: 'Requested' },
    courier: { type: String },
    awb: { type: String },
    sentAt: { type: Date },
    packagingConfirmed: { type: Boolean, default: false },
    rejectionReason: { type: String },
    notes: { type: String },
    approvedByContact: { type: String },
    rejectedByContact: { type: String },
    queryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionQuery' },
    feedbackLog: [{
      by: { type: String },
      text: { type: String },
      at: { type: Date, default: Date.now },
    }],
    timeline: [{
      event: { type: String },
      at: { type: Date, default: Date.now },
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  }],

  // Google Sheets sync
  sheetRowId: { type: String },
  sheetId: { type: String },
  lastSyncedAt: { type: Date },

  // Stage history (velocity tracking)
  stageHistory: [{
    stage: { type: String },
    enteredAt: { type: Date, default: Date.now },
    exitedAt: { type: Date },
    movedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],

  // Automation flags
  followUpReminders: { type: Number, default: 0 },
  lastReminderSent: { type: Date },
  isStale: { type: Boolean, default: false },

  // Conversion
  convertedToTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  productionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionOrder', index: true },
  isConverted: { type: Boolean, default: false },
  trackingToken: { type: String, unique: true, sparse: true, index: true },

  // Communication history (calls, WhatsApp chats, meeting notes)
  communicationLogs: [{
    type:              { type: String, enum: ['call', 'whatsapp', 'meeting', 'email', 'other'], default: 'call' },
    title:             { type: String },
    content:           { type: String },
    happenedAt:        { type: Date, default: Date.now },
    images:            [{ url: String, publicId: String, name: String }],
    audioFiles:        [{ url: String, publicId: String, name: String }],
    videoFiles:        [{ url: String, publicId: String, name: String }],
    addedBy:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Set only for auto-logged inbound WhatsApp messages — dedupes webhook retries
    whatsappMessageId: { type: String, index: true, sparse: true },
    createdAt:         { type: Date, default: Date.now },
  }],

  tags: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

leadSchema.index({ organizationId: 1, status: 1, assignedTo: 1 });
leadSchema.index({ organizationId: 1, phone: 1 });
leadSchema.index({ organizationId: 1, source: 1 });
leadSchema.index({ organizationId: 1, nextFollowUpAt: 1 });

module.exports = mongoose.model('Lead', leadSchema);
