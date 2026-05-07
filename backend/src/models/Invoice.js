const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  quantity:    { type: Number, required: true, min: 0.01 },
  unitPrice:   { type: Number, required: true, min: 0 },
  taxRate:     { type: Number, default: 0, min: 0, max: 100 },
  amount:      { type: Number, required: true },
  unit:        { type: String, trim: true, default: null },
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
}, { _id: true });

const invoiceSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'SENT', 'PAID', 'CANCELLED'],
      default: 'DRAFT',
    },
    customer: {
      name:    { type: String, required: true, trim: true },
      email:   { type: String, trim: true, default: null },
      phone:   { type: String, trim: true, default: null },
      address: { type: String, trim: true, default: null },
      gstin:   { type: String, trim: true, default: null },
    },
    items: [invoiceItemSchema],
    subtotal:    { type: Number, required: true, default: 0 },
    taxAmount:   { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },
    notes:     { type: String, trim: true, default: null },
    signature: { type: String, trim: true, default: null },
    issueDate: { type: Date, default: Date.now },
    dueDate:   { type: Date, default: null },
    paidDate:           { type: Date, default: null },
    inventoryDeducted:  { type: Boolean, default: false },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ organizationId: 1, status: 1 });
invoiceSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
