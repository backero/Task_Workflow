const { google } = require('googleapis');
const Organization = require('../models/Organization');
const MarketplaceSellerSnapshot = require('../models/MarketplaceSellerSnapshot');
const { getAuthorizedClient } = require('./googleDrive.service');
const logger = require('../utils/logger');

// Marketplace terminology differs. Build each platform tab from the metric
// keys that platform actually exposes instead of exporting a universal layout
// full of misleading blanks.
const CORE_HEADERS = [
  'Date', 'Captured At', 'Source', 'Capture Status', 'Daily Orders', 'Daily Sales (INR)',
  'Impressions', 'Clicks', 'CTR (%)', 'CVR (%)',
];
const PLATFORM_TABS = {
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  meesho: 'Meesho',
  snapdeal: 'Snapdeal',
};
const AMAZON_ASIN_HEADERS = [
  'Report Date', 'Captured At', 'Range Start', 'Range End', 'Parent ASIN', 'Child ASIN', 'SKU', 'Title',
  'Sessions', 'Sessions (B2B)', 'Page Views', 'Page Views (B2B)',
  'Featured Offer (%)', 'Units Ordered', 'Units Ordered (B2B)', 'CVR / Unit Session (%)',
  'Ordered Product Sales (INR)', 'Ordered Product Sales B2B (INR)', 'Total Order Items', 'Total Order Items (B2B)',
];

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

function flattenSiteData(value, path = '', rows = []) {
  if (value === null || value === undefined || typeof value !== 'object') {
    rows.push([path || '(value)', sheetValue(value)]);
    return rows;
  }
  if (Array.isArray(value)) {
    if (!value.length) rows.push([path || '(array)', '[]']);
    value.forEach((item, index) => flattenSiteData(item, `${path}[${index}]`, rows));
    return rows;
  }
  const entries = Object.entries(value);
  if (!entries.length) rows.push([path || '(object)', '{}']);
  entries.sort(([left], [right]) => left.localeCompare(right)).forEach(([key, item]) => {
    flattenSiteData(item, path ? `${path}.${key}` : key, rows);
  });
  return rows;
}

async function writeSiteDataTab(sheets, spreadsheetId, platform, snapshot) {
  const sheetName = `${PLATFORM_TABS[platform]} Site Data`;
  if (!snapshot) {
    await writeTab(sheets, spreadsheetId, sheetName, ['Path', 'Value'], [['status', 'No saved marketplace snapshot yet']]);
    return 1;
  }
  // This is the same latest, organization-scoped mirror object served to the
  // marketplace UI. Keep it in an auditable field/value layout so no visible
  // site fact is lost simply because it does not fit the daily KPI schema.
  const exportData = {
    snapshotDate: snapshot.date,
    capturedAt: snapshot.capturedAt,
    source: snapshot.source,
    metrics: snapshot.metrics,
    siteData: snapshot.data,
  };
  const rows = flattenSiteData(exportData);
  await writeTab(sheets, spreadsheetId, sheetName, ['Path', 'Value'], rows);
  return rows.length;
}

function firstNumeric(metrics, candidates) {
  for (const key of candidates) {
    const value = metrics[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function valueAtPath(object, path) {
  return path.split('.').reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), object);
}

// A mirror's compact `metrics` object is intentionally limited to trendable
// values. The platform screen often contains additional real headline values
// under `data`, though. Sheets must mirror what the site can show, not turn a
// present source value into N/A merely because it is outside the compact map.
function firstSnapshotNumber(snapshot, metricKeys = [], dataPaths = []) {
  const fromMetrics = firstNumeric(snapshot.metrics || {}, metricKeys);
  if (fromMetrics !== null) return fromMetrics;
  for (const path of dataPaths) {
    const value = valueAtPath(snapshot.data || {}, path);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function standardKpis(platform, snapshot) {
  const dailyKeys = {
    amazon: {
      orders: ['business_reports.units_ordered', 'orders.units_ordered_today'],
      sales: ['business_reports.ordered_product_sales', 'sales.ordered_product_sales_today', 'sales.today_global_sales'],
      data: {
        orders: ['platforms.amazon_in.orders', 'amazon_in.orders', 'orders.orders_today'],
        sales: ['platforms.amazon_in.revenue', 'amazon_in.revenue', 'sales.today_global_sales'],
        impressions: ['platforms.amazon_in.impressions', 'amazon_in.impressions'],
        clicks: ['platforms.amazon_in.clicks', 'amazon_in.clicks'],
        ctr: ['platforms.amazon_in.ctr_pct', 'amazon_in.ctr_pct'],
        cvr: ['platforms.amazon_in.cvr_pct', 'amazon_in.cvr_pct'],
      },
    },
    flipkart: {
      orders: ['home.new_orders', 'home.units_today'], sales: ['home.sales_today'],
      data: {
        orders: ['account_metrics.home.new_orders', 'account_metrics.home.units_today', 'account_metrics.business_health.units_7d'],
        sales: ['account_metrics.home.sales_today', 'account_metrics.business_health.sales_7d'],
        impressions: ['account_metrics.home.impressions_latest', 'account_metrics.business_health.impressions_7d'],
        clicks: ['account_metrics.ads.clicks'],
        ctr: ['account_metrics.ads.ctr_pct'],
        cvr: ['account_metrics.ads.cvr_pct', 'account_metrics.business_health.conversion_7d_pct'],
      },
    },
    meesho: {
      orders: ['home.daily_orders'], sales: [],
      data: {
        orders: ['account_metrics.home.daily_orders', 'kpis.orders_7d'],
        sales: ['account_metrics.home.daily_sales', 'kpis.sales_7d'],
        impressions: ['account_metrics.home.daily_views', 'kpis.impressions_7d'],
        clicks: ['account_metrics.home.daily_clicks', 'kpis.clicks_7d'],
        ctr: ['kpis.ctr'],
        cvr: ['kpis.conversion_pct_7d'],
      },
    },
    snapdeal: {
      orders: [], sales: [],
      data: {
        orders: ['week.orders', 'panel.orders_processed'],
        sales: ['week.revenue', 'panel.sales_completed'],
        impressions: ['week.impressions'],
        clicks: ['week.clicks'],
        ctr: ['week.ctr'],
        cvr: ['week.cvr'],
      },
    },
  }[platform] || { orders: [], sales: [], data: {} };
  const dataPaths = dailyKeys.data || {};
  const orders = firstSnapshotNumber(snapshot, dailyKeys.orders, dataPaths.orders);
  const sales = firstSnapshotNumber(snapshot, dailyKeys.sales, dataPaths.sales);
  const impressions = firstSnapshotNumber(snapshot, ['ads.impressions', 'advertising.impressions'], dataPaths.impressions);
  const clicks = firstSnapshotNumber(snapshot, ['ads.clicks', 'advertising.clicks', 'traffic.clicks'], dataPaths.clicks);
  const ctr = firstSnapshotNumber(snapshot, ['ads.ctr', 'ads.ctr_pct', 'advertising.ctr', 'traffic.ctr'], dataPaths.ctr);
  const cvr = firstSnapshotNumber(snapshot, [
    'ads.cvr', 'ads.cvr_pct', 'advertising.cvr', 'business_reports.unit_session_percentage',
  ], dataPaths.cvr);
  return [
    orders ?? '', sales ?? '', impressions ?? '', clicks ?? '',
    ctr ?? (impressions && clicks !== null ? (clicks / impressions) * 100 : ''),
    cvr ?? '',
  ];
}

function toPlatformRow(snapshot, metricKeys) {
  const data = snapshot.data || {};
  const metrics = snapshot.metrics || {};
  return [
    snapshot.date,
    snapshot.capturedAt ? new Date(snapshot.capturedAt).toISOString() : '',
    snapshot.source || '',
    typeof data.status === 'object' ? data.status.state || '' : data.status || '',
    ...standardKpis(snapshot.platform, snapshot),
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
  const siteDataRowsByPlatform = {};
  for (const [platform, sheetName] of Object.entries(PLATFORM_TABS)) {
    const platformSnapshots = snapshots.filter((snapshot) => snapshot.platform === platform);
    const headers = tabHeaders(platformSnapshots);
    const metricKeys = headers.slice(CORE_HEADERS.length, -1);
    const rows = platformSnapshots.map((snapshot) => toPlatformRow(snapshot, metricKeys));
    await writeTab(sheets, config.sheetId, sheetName, headers, rows);
    rowsByPlatform[platform] = rows.length;
    const latest = platformSnapshots.at(-1);
    siteDataRowsByPlatform[platform] = await writeSiteDataTab(sheets, config.sheetId, platform, latest);
  }
  // ASIN performance is a selected Business Reports period, not a daily
  // reading. Keep it out of the Amazon daily tab so it cannot be mistaken for
  // today's orders or sales.
  const latestAmazon = snapshots.filter((snapshot) => snapshot.platform === 'amazon').at(-1);
  const asinPerformance = latestAmazon?.data?.asinPerformance || {};
  const [rangeStart = '', rangeEnd = ''] = Array.isArray(asinPerformance.range) ? asinPerformance.range : [];
  const asinRows = (asinPerformance.rows || []).filter((row) => row && typeof row === 'object').map((row) => [
    latestAmazon?.date || '', asinPerformance.capturedAt || latestAmazon?.capturedAt || '', rangeStart, rangeEnd,
    row.parentAsin || '', row.childAsin || '', row.sku || '', row.title || '',
    row.sessions ?? '', row.sessionsB2b ?? '', row.pageViews ?? '', row.pageViewsB2b ?? '',
    row.featuredOfferPercentage ?? '', row.unitsOrdered ?? '', row.unitsOrderedB2b ?? '', row.unitSessionPercentage ?? '',
    row.orderedProductSales ?? '', row.orderedProductSalesB2b ?? '', row.totalOrderItems ?? '', row.totalOrderItemsB2b ?? '',
  ]);
  await writeTab(sheets, config.sheetId, 'Amazon ASIN Performance', AMAZON_ASIN_HEADERS, asinRows);
  rowsByPlatform.amazonAsinPerformance = asinRows.length;
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
  const result = { rows: snapshots.length, rowsByPlatform, siteDataRowsByPlatform, syncedAt: new Date().toISOString() };
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
