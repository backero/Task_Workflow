const { google } = require('googleapis');
const axios  = require('axios');
const logger = require('../utils/logger');
const {
  GOOGLE_SHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  GSHEET_TAB,
  GSHEET_NAME_COL,
  GSHEET_PHONE_COL,
  GSHEET_COMPANY_COL,
  GSHEET_EMAIL_COL,
  GSHEET_QUERY_COL,
} = require('../config/env');

const isConfigured = () =>
  !!(GOOGLE_SHEET_ID && GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY);

const getClient = () => {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
};

const colIndex = (headers, envVal, fallbacks) => {
  // 1. Exact match on env override
  if (envVal) {
    const i = headers.indexOf(envVal.trim().toLowerCase());
    if (i !== -1) return i;
  }
  // 2. Exact match on fallback keywords
  for (const fb of fallbacks) {
    const i = headers.indexOf(fb.toLowerCase());
    if (i !== -1) return i;
  }
  // 3. Contains match — handles "Phone Number", "Mobile No.", "WhatsApp No" etc.
  for (const fb of fallbacks) {
    const i = headers.findIndex(h => h.includes(fb.toLowerCase()));
    if (i !== -1) return i;
  }
  return -1;
};

/* Parse string[][] rows into lead objects — shared by all import methods */
const parseLeadRows = (rows) => {
  if (rows.length < 2) return { leads: [], noPhone: 0 };

  const headers = rows[0].map(h => String(h).trim().toLowerCase());

  const nameIdx    = colIndex(headers, GSHEET_NAME_COL,    ['name', 'customer name', 'contact name', 'full name', 'customer']);
  const phoneIdx   = colIndex(headers, GSHEET_PHONE_COL,   ['phone', 'mobile', 'whatsapp', 'phone number', 'contact', 'number', 'mob']);
  const companyIdx = colIndex(headers, GSHEET_COMPANY_COL, ['company', 'business', 'organization', 'company name', 'firm']);
  const emailIdx   = colIndex(headers, GSHEET_EMAIL_COL,   ['email', 'email id', 'email address', 'mail']);
  const queryIdx   = colIndex(headers, GSHEET_QUERY_COL,   ['message', 'query', 'requirement', 'details', 'notes', 'interest', 'product']);

  if (phoneIdx === -1) return null; // caller should handle "no phone column"

  const leads = [];
  let noPhone = 0;
  rows.slice(1).forEach((row, i) => {
    const phone = String(row[phoneIdx] || '').trim();
    if (!phone || phone.length < 5) { noPhone++; return; }
    leads.push({
      sheetRowId:  `row_${i + 2}`,
      name:     nameIdx    >= 0 ? String(row[nameIdx]    || '').trim() || 'Unknown' : 'Unknown',
      phone,
      company:  companyIdx >= 0 ? String(row[companyIdx] || '').trim() || null : null,
      email:    emailIdx   >= 0 ? String(row[emailIdx]   || '').trim() || null : null,
      query:    queryIdx   >= 0 ? String(row[queryIdx]   || '').trim() || null : null,
    });
  });
  return { leads, noPhone };
};

/* Simple CSV text → string[][] parser (handles quoted fields) */
const parseCSVText = (text) => {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.filter(l => l.trim()).map(line => {
    const row = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuote = false; }
        else { cur += ch; }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ',') { row.push(cur); cur = ''; }
        else { cur += ch; }
      }
    }
    row.push(cur);
    return row;
  });
};

/* Extract sheet ID from any Google Sheets URL */
const extractSheetId = (url) => {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
};

/* Extract tab gid from URL fragment — e.g. #gid=1234567890 */
const extractGid = (url) => {
  const m = url.match(/[#&]gid=(\d+)/);
  return m ? m[1] : null;
};

/* Fetch leads from a *public* Google Sheet URL (no API keys needed) */
const fetchFromPublicUrl = async (sheetUrl) => {
  const id = extractSheetId(sheetUrl);
  if (!id) throw new Error('Could not extract Sheet ID from URL. Make sure you paste the full Google Sheets link.');

  // Include gid if URL points to a specific tab (so the correct sheet tab is exported)
  const gid    = extractGid(sheetUrl);
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
  let text;
  try {
    const { data } = await axios.get(csvUrl, { responseType: 'text', timeout: 15000 });
    text = data;
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      throw new Error('Sheet is not public. Open the sheet → File → Share → Anyone with the link → Viewer, then try again.');
    }
    throw new Error(`Failed to fetch sheet: ${err.message}`);
  }

  const rows   = parseCSVText(text);
  const parsed = parseLeadRows(rows);
  if (parsed === null) throw new Error('No phone column found in sheet. Make sure a column is named "Phone", "Mobile", or similar.');
  const { leads, noPhone } = parsed;
  if (noPhone > 0) logger.warn(`[GSheet URL] ${noPhone} row(s) skipped — no phone number`);
  logger.info(`[GSheet URL] Fetched ${leads.length} lead rows`);
  return { leads, noPhone };
};

/* Fetch leads from an uploaded CSV buffer */
const fetchFromCSVBuffer = (buffer) => {
  const text   = buffer.toString('utf8');
  const rows   = parseCSVText(text);
  const parsed = parseLeadRows(rows);
  if (parsed === null) throw new Error('No phone column found in CSV. Make sure a column header is "Phone", "Mobile", or similar.');
  const { leads, noPhone } = parsed;
  if (noPhone > 0) logger.warn(`[CSV Import] ${noPhone} row(s) skipped — no phone number`);
  logger.info(`[CSV Import] Parsed ${leads.length} lead rows`);
  return { leads, noPhone };
};

const fetchLeadsFromSheet = async () => {
  if (!isConfigured()) {
    logger.warn('[GSheet] Not configured — set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY in .env');
    return [];
  }

  const tab   = GSHEET_TAB || 'Sheet1';
  const range = `${tab}!A:Z`;

  let rows;
  try {
    const sheets = getClient();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range,
    });
    rows = data.values || [];
  } catch (err) {
    logger.error(`[GSheet] Failed to fetch: ${err.message}`);
    throw err;
  }

  const parsed = parseLeadRows(rows);
  if (parsed === null) {
    logger.warn('[GSheet] No phone column found — verify column headers or set GSHEET_PHONE_COL in .env');
    return { leads: [], noPhone: 0 };
  }
  const { leads, noPhone } = parsed;
  if (noPhone > 0) logger.warn(`[GSheet] ${noPhone} row(s) skipped — no phone number`);
  logger.info(`[GSheet] Fetched ${leads.length} lead rows`);
  return { leads, noPhone };
};

module.exports = { fetchLeadsFromSheet, fetchFromPublicUrl, fetchFromCSVBuffer, isConfigured };
