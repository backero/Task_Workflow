const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true },
  logo: { type: String },
  email: { type: String, required: true, lowercase: true },
  phone: { type: String },
  whatsapp: { type: String },
  address: {
    street: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    pincode: String,
  },
  gstNumber: { type: String },
  plan: { type: String, enum: ['trial', 'starter', 'professional', 'enterprise'], default: 'trial' },
  planExpiry: { type: Date },
  isActive: { type: Boolean, default: true },
  settings: {
    currency: { type: String, default: 'INR' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    workingDays: { type: [String], default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
    workingHours: { start: { type: String, default: '09:00' }, end: { type: String, default: '18:00' } },
    enableWhatsApp: { type: Boolean, default: false },
    enableEmailNotifications: { type: Boolean, default: true },
    maxTasksPerEmployee: { type: Number, default: 20 },
  },
  departments: [{ type: String }],
  whatsappSessionActive: { type: Boolean, default: false },
  crmLeadGroupId: { type: String, default: null },
  googleSheets: {
    sheetId: { type: String },
    sheetGid: { type: String },           // tab GID from URL (#gid=xxx)
    sheetName: { type: String, default: 'Sheet1' },
    syncEnabled: { type: Boolean, default: false },
    syncIntervalMinutes: { type: Number, default: 5 },
    lastSyncedAt: { type: Date },
    lastSyncResult: { type: mongoose.Schema.Types.Mixed },
    defaultAssignTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    columnMap: { type: mongoose.Schema.Types.Mixed },
    writeBackEnabled: { type: Boolean, default: false }, // CRM → Sheet sync
    lastWriteBackAt: { type: Date },
  },
  signatureUrl: { type: String },
  bankDetails: {
    bankName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    accountName: { type: String },
    branch: { type: String },
    upiId: { type: String },
    upiQrUrl: { type: String },
  },
  invoicePrefix: { type: String, default: 'INV' },
  invoiceTerms: { type: String, default: 'Payment due within 30 days of invoice date. Late payments attract 2% interest per month.' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

organizationSchema.index({ slug: 1 });

module.exports = mongoose.model('Organization', organizationSchema);
