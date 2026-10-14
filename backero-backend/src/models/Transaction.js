const mongoose = require('mongoose');
const { TRANSACTION_TYPES } = require('../utils/constants');

const transactionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  type: { type: String, enum: Object.values(TRANSACTION_TYPES), required: true },
  category: { type: String, required: true },
  subCategory: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  description: { type: String, required: true },
  date: { type: Date, required: true, default: Date.now },
  paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other'], default: 'bank_transfer' },
  reference: { type: String },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  vendor: {
    name: String,
    contact: String,
    gstin: String,
  },
  gstAmount: { type: Number, default: 0 },
  tdsAmount: { type: Number, default: 0 },
  attachments: [{ url: String, name: String }],
  isRecurring: { type: Boolean, default: false },
  recurringFrequency: { type: String },
  tags: [{ type: String }],
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

transactionSchema.index({ organizationId: 1, type: 1, date: -1 });
transactionSchema.index({ organizationId: 1, category: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
