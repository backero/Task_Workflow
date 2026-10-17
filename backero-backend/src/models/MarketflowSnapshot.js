const mongoose = require('mongoose');

/**
 * Latest synced data per marketplace-automation platform/endpoint. Written
 * by python-service/mongo_sync.py (Meesho/Snapdeal/Flipkart's own scraper
 * processes, on their own schedule) and by src/services/marketflowSync.service.js
 * (amazon-server, proxied live since it's already Node). Read-only from the
 * API's perspective — src/routes/marketflow.routes.js never writes here.
 *
 * `data` is intentionally untyped: each platform's overview shape differs
 * and is already validated/computed correctly by its own source service —
 * duplicating that shape here would just be another place for it to drift.
 */
const marketflowSnapshotSchema = new mongoose.Schema({
  platform: { type: String, required: true, enum: ['amazon', 'meesho', 'snapdeal', 'flipkart', 'myntra', 'jiomart'] },
  endpoint: { type: String, required: true, default: 'overview' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  syncedAt: { type: Date, default: Date.now },
}, { timestamps: true });

marketflowSnapshotSchema.index({ platform: 1, endpoint: 1 }, { unique: true });

module.exports = mongoose.model('MarketflowSnapshot', marketflowSnapshotSchema);
