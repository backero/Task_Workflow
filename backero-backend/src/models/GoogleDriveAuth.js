const mongoose = require('mongoose');

// Singleton document — Document Wallet uploads run as a real Google account
// (not a service account, which has no storage quota of its own in a
// personal "My Drive" — see googleDrive.service.js), so we store the one
// OAuth refresh token issued when an admin connects their Google account.
const googleDriveAuthSchema = new mongoose.Schema({
  refreshToken: { type: String, required: true, select: false },
  connectedEmail: { type: String },
  connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('GoogleDriveAuth', googleDriveAuthSchema);
