const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  name: String,
  weight: { type: Number, default: 0 },
  unit: { type: String, default: 'ml' },
  stock: { type: Number, default: 0 },
  stockUnit: { type: String, default: 'pcs' },
  mrp: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  b2bPrice: { type: Number, default: 0 },
  costPrice: { type: Number, default: 0 },
}, { _id: true });

const formulationRowSchema = new mongoose.Schema({
  rawMaterialId: String,
  name: String,
  percentage: { type: Number, default: 0 },
  quantity: { type: Number, default: 0 },
  unit: { type: String, default: 'g' },
  costPerKg: { type: Number, default: 0 },
}, { _id: true });

const packagingItemSchema = new mongoose.Schema({
  name: String,
  qty: { type: Number, default: 1 },
  rate: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  optional: { type: Boolean, default: false },
}, { _id: true });

const catalogProductSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  code:         { type: String, required: true, trim: true },
  name:         { type: String, required: true, trim: true },
  category:     { type: String, required: true },
  subCategory:  String,
  type:         String,
  unit:         { type: String, default: 'ml' },
  weight:       { type: Number, default: 0 },
  gstRate:      { type: Number, default: 18 },
  hsnCode:      String,
  shelfLife:    { type: Number, default: 0 },
  status:       { type: String, enum: ['Active', 'Discontinued'], default: 'Active' },
  discontinuedDate: Date,
  description:  String,
  storage:      String,
  certifications: String,
  barcode:      String,
  image:        String,

  formulation: {
    refWeight: { type: Number, default: 100 },
    refUnit:   { type: String, default: 'ml' },
    rows:      [formulationRowSchema],
  },

  variants: [variantSchema],

  standardAssumptions: {
    equipmentPct:    { type: Number, default: 3 },
    consumablesPct:  { type: Number, default: 1 },
    storagePct:      { type: Number, default: 2 },
    housekeepingPct: { type: Number, default: 1 },
    adminPct:        { type: Number, default: 5 },
    wastagePct:      { type: Number, default: 2 },
    image:           String,
    lastUpdated:     Date,
  },

  rnd: {
    testing:       { type: Number, default: 0 },
    consumables:   { type: Number, default: 0 },
    samples:       { type: Number, default: 0 },
    overhead:      { type: Number, default: 0 },
    otherOverhead: { type: Number, default: 0 },
    qc:            { type: Number, default: 0 },
    lifecycle:     { type: Number, default: 1000 },
    docText:       String,
    researchGuide: String,
    procedure:     String,
    lastUpdated:   Date,
  },

  productionOverhead: {
    electricity: { type: Number, default: 0 },
    labor:       { type: Number, default: 0 },
    labTesting:  { type: Number, default: 0 },
    other:       { type: Number, default: 0 },
    lastUpdated: Date,
  },

  packaging: {
    items: [packagingItemSchema],
    charges: {
      machine:    { type: Number, default: 0 },
      shrinkWrap: { type: Number, default: 0 },
      other:      { type: Number, default: 0 },
    },
    lastUpdated: Date,
  },

  costing: {
    margins: {
      exFactory:   { type: Number, default: 10 },
      dealer:      { type: Number, default: 15 },
      distributor: { type: Number, default: 20 },
      retailer:    { type: Number, default: 25 },
      selling:     { type: Number, default: 35 },
      b2b:         { type: Number, default: 20 },
      b2c:         { type: Number, default: 40 },
    },
    lastUpdated: Date,
  },

  marketplace: {
    packaging: [packagingItemSchema],
    fees: {
      flipkart: { commission: { type: Number, default: 15 }, fixed: { type: Number, default: 30 }, shipping: { type: Number, default: 50 }, collection: { type: Number, default: 2 } },
      amazon:   { commission: { type: Number, default: 15 }, fixed: { type: Number, default: 40 }, shipping: { type: Number, default: 50 }, fba:        { type: Number, default: 3 } },
      meesho:   { commission: { type: Number, default: 0  }, shipping: { type: Number, default: 70 }, collection: { type: Number, default: 0 }, penalty: { type: Number, default: 2 } },
      snapdeal: { commission: { type: Number, default: 12 }, fixed: { type: Number, default: 20 }, shipping: { type: Number, default: 50 }, collection: { type: Number, default: 1.5 } },
    },
    margins: {
      flipkart: { type: Number, default: 25 },
      amazon:   { type: Number, default: 25 },
      meesho:   { type: Number, default: 30 },
      snapdeal: { type: Number, default: 25 },
    },
    lastUpdated: Date,
  },

  history: [{ action: String, date: { type: Date, default: Date.now }, detail: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

catalogProductSchema.index({ organizationId: 1, code: 1 }, { unique: true });
catalogProductSchema.index({ organizationId: 1, status: 1, category: 1 });

module.exports = mongoose.model('CatalogProduct', catalogProductSchema);
