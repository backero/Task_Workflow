const mongoose = require('mongoose');

/**
 * One real daily data point per platform, captured from the actual synced
 * MarketflowSnapshot the first time each day it's read (see
 * captureTrendPointIfNeeded in marketflow.routes.js). Exists because the
 * previous /v1/trends/* endpoint proxied straight to amazon-server, which
 * has no real historical data for meesho/snapdeal/flipkart and was simply
 * repeating the latest snapshot's numbers across every requested day —
 * flat-lined, not a trend. This collection only ever holds real numbers:
 * one point can't be captured until a real synced value exists for that day.
 */
const marketflowTrendPointSchema = new mongoose.Schema({
  platform: { type: String, required: true, enum: ['meesho', 'snapdeal', 'flipkart'] },
  date: { type: String, required: true }, // YYYY-MM-DD, IST
  revenue: { type: Number, default: 0 },
  orders: { type: Number, default: 0 },
  impressions: { type: Number, default: 0 },
  ctr_pct: { type: Number, default: 0 },
  cvr_pct: { type: Number, default: 0 },
  capturedAt: { type: Date, default: Date.now },
});

marketflowTrendPointSchema.index({ platform: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('MarketflowTrendPoint', marketflowTrendPointSchema);
