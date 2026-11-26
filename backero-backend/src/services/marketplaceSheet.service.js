const { google } = require('googleapis');
const Organization = require('../models/Organization');
const MarketplaceSellerSnapshot = require('../models/MarketplaceSellerSnapshot');
const { getAuthorizedClient } = require('./googleDrive.service');
const logger = require('../utils/logger');

const HEADERS = [
  'Date', 'Platform', 'Captured At', 'Source', 'Capture Status',
  'Orders', 'Sales (INR)', 'Impressions', 'Clicks', 'CTR (%)', 'CVR (%)',
  'Active Listings', 'Total Listings', 'Stock Units', 'Raw Metrics (JSON)',
];
const PLATFORM_TABS = {
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  meesho: 'Meesho',
  snapdeal: 'Snapdeal',
};

function numeric(metrics, candidates) {
  for (const key of candidates) {
    const value = metrics?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return '';
}

function toRow(snapshot) {
  const metrics = snapshot.metrics || {};
  const data = snapshot.data || {};
  return [
    snapshot.date,
    snapshot.platform,
    snapshot.capturedAt ? new Date(snapshot.capturedAt).toISOString() : '',
    snapshot.source || '',
    typeof data.status === 'object' ? data.status.state || '' : data.status || '',
    numeric(metrics, ['orders.orders_30d', 'orders.units_ordered_today', 'orders.open_orders']),
    numeric(metrics, ['sales.sales_30d', 'sales.today_global_sales', 'sales.ordered_product_sales_today', 'product_performance.visible_product_sales']),
    numeric(metrics, ['ads.impressions', 'advertising.impressions', 'traffic.impressions']),
    numeric(metrics, ['ads.clicks', 'advertising.clicks', 'traffic.clicks']),
    numeric(metrics, ['ads.ctr', 'advertising.ctr', 'traffic.ctr']),
    numeric(metrics, ['ads.cvr', 'advertising.cvr', 'traffic.cvr', 'conversion.cvr']),
    numeric(metrics, ['inventory.active_listings', 'listing_status.active']),
    numeric(metrics, ['inventory.total_listings']),
    numeric(metrics, ['inventory.stock_units', 'inventory.available']),
    JSON.stringify(metrics),
  ];
}

async function getSheets() {
  const auth = await getAuthorizedClient();
  if (!auth) throw new Error('Google Drive is not connected. Reconnect it in Document Wallet.');
  return google.sheets({ version: 'v4', auth });
}

async function ensureTab(sheets, spreadsheetId, sheetName) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const existing = (metadata.data.sheets || []).find((sheet) => sheet.properties?.title === sheetName);
  if (existing) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  });
}

async function writeTab(sheets, spreadsheetId, sheetName, rows) {
  await ensureTab(sheets, spreadsheetId, sheetName);
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${sheetName}'!A2:O` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1:O${Math.max(rows.length + 1, 1)}`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS, ...rows] },
  });
}

async function syncMarketplaceSheet(organizationId) {
  const org = await Organization.findById(organizationId).select('marketplaceSheets');
  const config = org?.marketplaceSheets;
  if (!config?.enabled || !config.sheetId) return { skipped: true, reason: 'not_configured' };
  const sheets = await getSheets();
  const snapshots = await MarketplaceSellerSnapshot.find({ organizationId })
    .sort({ date: 1, platform: 1 }).lean();
  const rowsByPlatform = {};
  for (const [platform, sheetName] of Object.entries(PLATFORM_TABS)) {
    const rows = snapshots.filter((snapshot) => snapshot.platform === platform).map(toRow);
    await writeTab(sheets, config.sheetId, sheetName, rows);
    rowsByPlatform[platform] = rows.length;
  }
  // The original combined tab is intentionally retained as a read-only
  // historical view; all future platform exports are written to their own tabs.
  const result = { rows: snapshots.length, rowsByPlatform, syncedAt: new Date().toISOString() };
  await Organization.findByIdAndUpdate(organizationId, {
    'marketplaceSheets.lastSyncedAt': new Date(),
    'marketplaceSheets.lastSyncResult': result,
  });
  return result;
}

async function syncAllMarketplaceSheets() {
  const orgs = await Organization.find({ 'marketplaceSheets.enabled': true, 'marketplaceSheets.sheetId': { $exists: true, $ne: '' } }).select('_id');
  const results = {};
  for (const org of orgs) {
    try { results[String(org._id)] = await syncMarketplaceSheet(org._id); }
    catch (error) {
      results[String(org._id)] = { error: error.message };
      logger.error(`[Marketplace Sheets] Sync failed for ${org._id}: ${error.message}`);
    }
  }
  return results;
}

module.exports = { syncMarketplaceSheet, syncAllMarketplaceSheets };
