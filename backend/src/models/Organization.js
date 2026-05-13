const mongoose = require('mongoose');
const { PLANS } = require('../utils/constants');

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers and hyphens'],
    },
    logo: { type: String, default: null },
    plan: {
      type: String,
      enum: Object.values(PLANS),
      default: PLANS.FREE,
    },
    isActive: { type: Boolean, default: true },
    settings: {
      whatsappEnabled: { type: Boolean, default: false },
      whatsappPhoneId: { type: String, default: null },
      whatsappToken: { type: String, default: null, select: false },
      timezone: { type: String, default: 'Asia/Kolkata' },
      currency: { type: String, default: 'INR' },
    },
    address: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' },
    },
    gstin:  { type: String, trim: true, default: null },
    phone:  { type: String, trim: true, default: null },
    email:  { type: String, trim: true, default: null },
    bankDetails: {
      bankName:      { type: String, trim: true, default: null },
      accountNumber: { type: String, trim: true, default: null },
      ifsc:          { type: String, trim: true, default: null },
      upiId:         { type: String, trim: true, default: null },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

organizationSchema.index({ isActive: 1 });

module.exports = mongoose.model('Organization', organizationSchema);
