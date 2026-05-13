const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  description: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: 'pcs' },
  unitPrice: { type: Number, required: true },
  gstRate: { type: Number, default: 18 },
  gstAmount: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  hsnCode: { type: String },
});

const invoiceSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  invoiceNumber: { type: String, required: true },
  type: { type: String, enum: ['invoice', 'proforma', 'credit_note', 'debit_note'], default: 'invoice' },
  status: { type: String, enum: ['draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled'], default: 'draft', index: true },

  // Client
  client: {
    name: { type: String, required: true },
    email: String,
    phone: String,
    address: String,
    gstin: String,
    state: String,
    stateCode: String,
  },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },

  // Items
  lineItems: [lineItemSchema],

  // Amounts
  subtotal: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  totalGst: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },

  // Dates
  issueDate: { type: Date, default: Date.now },
  dueDate: { type: Date },
  paidDate: { type: Date },

  // Payment info
  paymentTerms: { type: String, default: 'Net 30' },
  paymentHistory: [{
    amount: Number,
    method: String,
    date: Date,
    reference: String,
    notes: String,
  }],

  notes: { type: String },
  terms: { type: String },
  pdfUrl: { type: String },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
