const MarketplaceSellerSnapshot = require('../models/MarketplaceSellerSnapshot');

const MIRRORS = {
  amazon: require('../models/AmazonSellerMirror'),
  flipkart: require('../models/FlipkartSellerMirror'),
  meesho: require('../models/MeeshoSellerMirror'),
  snapdeal: require('../models/SnapdealSellerMirror'),
};

function flattenMetrics(value, prefix = '', result = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  if (typeof value.value === 'number' && Number.isFinite(value.value)) {
    if (prefix) result[prefix] = value.value;
    return result;
  }
  for (const [key, item] of Object.entries(value)) {
    flattenMetrics(item, prefix ? `${prefix}.${key}` : key, result);
  }
  return result;
}

function compactMetrics(data) {
  const metrics = flattenMetrics(data?.metrics || {});
  for (const [key, rows] of Object.entries(data || {})) {
    if (Array.isArray(rows)) metrics[`rows.${key}`] = rows.length;
  }
  for (const [key, amount] of Object.entries(data?.inventorySummary || {})) {
    if (typeof amount === 'number' && Number.isFinite(amount)) metrics[`inventory.${key}`] = amount;
  }
  return metrics;
}

async function archiveMirror(platform, organizationId, data, syncedAt) {
  const capturedAt = new Date(data?.lastScrapedAt || syncedAt || Date.now());
  if (Number.isNaN(capturedAt.getTime()) || data?.status === 'needs_you' || data?.status?.state === 'needs_you') return false;
  const metrics = compactMetrics(data);
  if (!Object.keys(metrics).length) return false;
  const date = capturedAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  await MarketplaceSellerSnapshot.updateOne(
    { organizationId, platform, date },
    { $set: { capturedAt, source: data?.source || platform, metrics, data } },
    { upsert: true },
  );
  return true;
}

async function archiveAllSellerMirrors() {
  const results = {};
  for (const [platform, Mirror] of Object.entries(MIRRORS)) {
    const mirrors = await Mirror.find({}, { organizationId: 1, data: 1, syncedAt: 1 }).lean();
    let saved = 0;
    for (const mirror of mirrors) {
      if (await archiveMirror(platform, mirror.organizationId, mirror.data, mirror.syncedAt)) saved += 1;
    }
    results[platform] = { scanned: mirrors.length, saved };
  }
  return results;
}

module.exports = { archiveAllSellerMirrors };
