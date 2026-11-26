const { google } = require('googleapis');
const Organization = require('../models/Organization');
const MarketplaceSellerSnapshot = require('../models/MarketplaceSellerSnapshot');
const { getAuthorizedClient } = require('./googleDrive.service');
const logger = require('../utils/logger');

// Marketplace terminology differs. Build each platform tab from the metric
// keys that platform actually exposes instead of exporting a universal layout
// full of misleading blanks.
const CORE_HEADERS = ['Date', 'Captured At', 'Source', 'Capture Status'];
const PLATFORM_TABS = {
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  meesho: 'Meesho',
  snapdeal: 'Snapdeal',
};

function tabHeaders(snapshots) {
  const metricKeys = [...new Set(snapshots.flatMap((snapshot) => Object.keys(snapshot.metrics || {})))].sort();
  return [...CORE_HEADERS, ...metricKeys, 'Raw Metrics (JSON)'];
}

function sheetValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function toPlatformRow(snapshot, metricKeys) {
  const data = snapshot.data || {};
  const metrics = snapshot.metrics || {};
  return [
    snapshot.date,
    snapshot.capturedAt ? new Date(snapshot.capturedAt).toISOString() : '',
    snapshot.source || '',
    typeof data.status === 'object' ? data.status.state || '' : data.status || '',
    ...metricKeys.map((key) => sheetValue(metrics[key])),
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

async function writeTab(sheets, spreadsheetId, sheetName, headers, rows) {
  await ensureTab(sheets, spreadsheetId, sheetName);
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${sheetName}'!A:ZZ` });
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `'${sheetName}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers, ...rows] },
  });
}

async function writeCustomTab(sheets, spreadsheetId, sheetName, headers, rows) {
  await ensureTab(sheets, spreadsheetId, sheetName);
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${sheetName}'!A2:Z` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1`, valueInputOption: 'RAW',
    requestBody: { values: [headers, ...rows] },
  });
}

function istDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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
    const platformSnapshots = snapshots.filter((snapshot) => snapshot.platform === platform);
    const headers = tabHeaders(platformSnapshots);
    const metricKeys = headers.slice(CORE_HEADERS.length, -1);
    const rows = platformSnapshots.map((snapshot) => toPlatformRow(snapshot, metricKeys));
    await writeTab(sheets, config.sheetId, sheetName, headers, rows);
    rowsByPlatform[platform] = rows.length;
  }
  const today = istDate();
  const healthRows = Object.entries(PLATFORM_TABS).map(([platform]) => {
    const latest = snapshots.filter((snapshot) => snapshot.platform === platform).at(-1);
    const data = latest?.data || {};
    const state = typeof data.status === 'object' ? data.status.state || '' : data.status || '';
    return [platform, latest?.date || '', latest?.capturedAt ? new Date(latest.capturedAt).toISOString() : '', latest?.source || '', latest?.date === today ? 'Fresh today' : 'Missing today', state];
  });
  await writeCustomTab(sheets, config.sheetId, 'Sync Health', ['Platform', 'Last business date', 'Captured at', 'Source', 'Today status', 'Capture state'], healthRows);
  const months = new Map();
  for (const snapshot of snapshots) {
    const key = `${snapshot.platform}:${snapshot.date.slice(0, 7)}`;
    const group = months.get(key) || { platform: snapshot.platform, month: snapshot.date.slice(0, 7), count: 0, latest: snapshot.date };
    group.count += 1;
    if (snapshot.date > group.latest) group.latest = snapshot.date;
    months.set(key, group);
  }
  await writeCustomTab(sheets, config.sheetId, 'Summary', ['Platform', 'Month', 'Saved daily readings', 'Latest business date'], [...months.values()].map((group) => [group.platform, group.month, group.count, group.latest]));
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
