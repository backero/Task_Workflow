const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, trim: true, uppercase: true },
  barcode: { type: String },
  category: { type: String, required: true },
  subCategory: { type: String },
  unit: { type: String, required: true, default: 'pcs' },
  description: { type: String },
  images: [{ type: String }],

  // Pricing
  costPrice: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  mrp: { type: Number, default: 0 },
  gstRate: { type: Number, default: 18 },
  hsnCode: { type: String },
  batchNumber: { type: String },

  // Stock
  lastStockIn: { type: Date },
  currentStock: { type: Number, default: 0, min: 0 },
  minStockLevel: { type: Number, default: 0 },
  maxStockLevel: { type: Number },
  reorderPoint: { type: Number, default: 0 },
  reorderQuantity: { type: Number, default: 0 },

  // Warehouse
  warehouseLocation: { type: String },
  shelf: { type: String },

  // Supplier
  supplier: { type: String },

  // Raw material batch tracking
  enableMinStock: { type: Boolean, default: true },
  batches: [{
    batchId:      { type: String },
    quantity:     { type: Number, default: 0 },
    totalPrice:   { type: Number },
    price:        { type: Number },
    batchNumber:  { type: String },
    expiryDate:   { type: Date },
    receivedDate: { type: Date },
    location:     { type: String },
    supplier:     { type: String },
    invoice:      { type: String },
    notes:        { type: String },
    qcCheckedBy:  { type: String },
    qcDate:       { type: String },
    qcStatus:     { type: String, default: 'pass' },
    qcNotes:      { type: String },
  }],

  // ISO 9001:2015 QC fields (raw materials)
  qcChecker:       { type: String },
  qcNumber:        { type: String },
  refCheckNumber:  { type: String },
  qcPassed:        { type: Boolean, default: false },
  qcNotes:         { type: String },

  // Finished good fields
  productType:       { type: String },
  shelfLife:         { type: Number },
  certifications:    { type: String },
  storageConditions: { type: String },
  variants: [{
    name:         { type: String },
    size:         { type: Number },
    unit:         { type: String },
    moq:          { type: Number },
    moqUnit:      { type: String },
    sellingPrice: { type: Number },
    mrp:          { type: Number },
  }],

  // Phase 2: Formulation, Costing & Marketplace (stored as flexible embedded docs)
  formulation:         { type: mongoose.Schema.Types.Mixed, default: null },
  standardAssumptions: { type: mongoose.Schema.Types.Mixed, default: null },
  rnd:                 { type: mongoose.Schema.Types.Mixed, default: null },
  productionOverhead:  { type: mongoose.Schema.Types.Mixed, default: null },
  bomPackaging:        { type: mongoose.Schema.Types.Mixed, default: null },
  costing:             { type: mongoose.Schema.Types.Mixed, default: null },
  marketplace:         { type: mongoose.Schema.Types.Mixed, default: null },

  // Type flags
  isRawMaterial: { type: Boolean, default: false },
  isFinishedGood: { type: Boolean, default: true },
  isSellable: { type: Boolean, default: true },

  // Marketplace listings
  marketplaceListings: [{
    platform: { type: String },
    listingId: { type: String },
    url: { type: String },
    isActive: { type: Boolean, default: true },
  }],

  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

productSchema.index({ organizationId: 1, sku: 1 }, { unique: true });
productSchema.index({ organizationId: 1, category: 1 });
productSchema.index({ organizationId: 1, currentStock: 1 });

// Virtual: low stock alert
productSchema.virtual('isLowStock').get(function () {
  return this.currentStock <= this.minStockLevel;
});

productSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
