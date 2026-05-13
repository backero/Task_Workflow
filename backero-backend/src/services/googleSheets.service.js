const axios = require('axios');
const Lead = require('../models/Lead');
const Organization = require('../models/Organization');
const logger = require('../utils/logger');

// ── CSV approach (public sheet, no auth needed) ────────────────────────────
const fetchSheetCSV = async (sheetId, gid) => {
  const gidParam = gid ? `&gid=${gid}` : '';
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;
  const response = await axios.get(url, {
    timeout: 15000,
    maxRedirects: 5,
    responseType: 'text',
    headers: { 'User-Agent': 'Backero-CRM/1.0' },
    validateStatus: (s) => s < 400,
  });
  if (!response.data || typeof response.data !== 'string') throw new Error('Empty response from Google Sheets');
  return response.data;
};

// ── Parse CSV (handles quoted fields with commas/newlines) ─────────────────
const parseCSV = (csvText) => {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        currentField += '"';
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
      } else if (ch === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }
  if (currentField || currentRow.length) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
};

// ── Map raw header → lead field ───────────────────────────────────────────
const HEADER_MAP = {
  // phone variations
  phone: 'phone', mobile: 'phone', contact: 'phone', number: 'phone',
  mob: 'phone', 'phone number': 'phone', 'mobile number': 'phone',
  'contact number': 'phone', 'phone no': 'phone', 'mobile no': 'phone',
  'whatsapp number': 'phone', 'whatsapp no': 'phone',
  'customer phone': 'phone', 'customer mobile': 'phone', 'customer contact': 'phone',
  'client phone': 'phone', 'client mobile': 'phone',
  // name variations
  name: 'name', 'full name': 'name', 'customer name': 'name', 'lead name': 'name',
  'client name': 'name', 'contact name': 'name', 'user name': 'name',
  // email
  email: 'email', 'email id': 'email', 'email address': 'email', 'e-mail': 'email',
  'customer email': 'email',
  // company
  company: 'company', organization: 'company', business: 'company', 'company name': 'company',
  'business name': 'company', firm: 'company',
  // location
  city: 'city', state: 'state', location: 'city', area: 'city',
  // product/interest/query
  product: 'notes', 'product interest': 'notes', 'product name': 'notes', item: 'notes',
  'interested in': 'notes', service: 'notes', query: 'notes',
  'purpose / query': 'notes', 'purpose/query': 'notes', purpose: 'notes',
  'enquiry': 'notes', inquiry: 'notes', requirement: 'notes',
  // notes/remarks
  notes: 'notes', remarks: 'notes', comment: 'notes', comments: 'notes',
  message: 'notes', description: 'notes', details: 'notes',
  'follow-up notes': 'notes', 'follow up notes': 'notes', 'followup notes': 'notes',
  // priority
  priority: 'priority',
  // source
  source: 'source', 'lead source': 'source', channel: 'source', medium: 'source',
  category: 'source', 'lead category': 'source',
  // status
  status: 'rawStatus',
  // value
  value: 'estimatedValue', amount: 'estimatedValue', budget: 'estimatedValue',
  'deal value': 'estimatedValue',
  // assignee
  'assigned to': 'rawAssignedTo', assignee: 'rawAssignedTo',
  // extra
  designation: 'designation', role: 'designation',
};

const resolveHeader = (raw, customMap = {}) => {
  const key = raw.toLowerCase().trim();
  return customMap[key] || HEADER_MAP[key] || null;
};

// ── Main sync function ─────────────────────────────────────────────────────
const syncLeadsFromSheet = async (organizationId, sheetId, sheetGid = '', sheetName = 'Sheet1', assignedTo = null, columnMap = {}) => {
  let csvText;

  // Try CSV export first (public sheet — no auth)
  try {
    csvText = await fetchSheetCSV(sheetId, sheetGid);
    logger.info(`[Sheets] Fetched CSV for sheet ${sheetId} (gid: ${sheetGid || 'default'})`);
  } catch (csvErr) {
    // Fallback: try service account if configured
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL.includes('your_service')) {
      try {
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `${sheetName}!A:Z`,
        });
        const rows = response.data.values || [];
        if (rows.length < 2) return { synced: 0, skipped: 0, errors: [], totalRows: 0 };
        // Convert to CSV-like structure
        const headers = rows[0].map((h) => h?.toLowerCase().trim());
        const dataRows = rows.slice(1);
        return await processRows(organizationId, headers, dataRows, sheetId, sheetGid, assignedTo, columnMap);
      } catch (saErr) {
        throw new Error(`Sheet access failed. Make sure it is shared as "Anyone with link can view". (${csvErr.message})`);
      }
    }
    throw new Error(`Cannot access the sheet. Share it as "Anyone with link can view" in Google Sheets. (${csvErr.message})`);
  }

  // Parse CSV
  const rows = parseCSV(csvText);
  if (rows.length < 2) return { synced: 0, skipped: 0, errors: [], totalRows: 0 };

  const headers = rows[0].map((h) => h?.toLowerCase().trim());
  const dataRows = rows.slice(1);

  return processRows(organizationId, headers, dataRows, sheetId, sheetGid, assignedTo, columnMap);
};

const processRows = async (organizationId, headers, dataRows, sheetId, sheetGid, assignedTo, columnMap = {}) => {
  let synced = 0, skipped = 0, updated = 0;
  const errors = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    try {
      // Map each column header → field name
      const lead = {};
      headers.forEach((header, idx) => {
        const field = resolveHeader(header, columnMap);
        if (field && row[idx]) lead[field] = row[idx].trim();
      });

      const phone = lead.phone;
      const name = lead.name;
      if (!phone || !name) { skipped++; continue; }

      // Normalise phone: take last 10 digits
      const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
      if (cleanPhone.length !== 10) { skipped++; continue; }

      const rowKey = `${sheetId}_${sheetGid}_row_${i + 2}`;

      // Check for existing lead by phone OR by rowKey
      const existing = await Lead.findOne({
        organizationId,
        $or: [{ phone: cleanPhone }, { sheetRowId: rowKey }],
      });

      if (existing) {
        // Update notes/status if changed
        let changed = false;
        if (lead.notes && existing.notes !== lead.notes) { existing.notes = lead.notes; changed = true; }
        if (lead.rawStatus) { /* status changes handled manually by sales */ }
        if (changed) { await existing.save(); updated++; } else { skipped++; }
        continue;
      }

      // Normalise priority
      const rawPriority = (lead.priority || '').toLowerCase();
      const priority = ['low', 'medium', 'high', 'critical'].includes(rawPriority) ? rawPriority : 'medium';

      // Normalise estimated value
      const estimatedValue = lead.estimatedValue
        ? Number(String(lead.estimatedValue).replace(/[₹,\s]/g, '')) || 0
        : 0;

      await Lead.create({
        organizationId,
        name: String(name).trim(),
        phone: cleanPhone,
        email: lead.email || '',
        company: lead.company || '',
        city: lead.city || '',
        state: lead.state || '',
        designation: lead.designation || '',
        source: 'Google Sheets',
        status: 'New Lead',
        priority,
        estimatedValue,
        notes: lead.notes || '',
        assignedTo: assignedTo || undefined,
        sheetRowId: rowKey,
        sheetId,
        lastSyncedAt: new Date(),
        createdBy: assignedTo || undefined,
      });
      synced++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err.message}`);
    }
  }

  logger.info(`[Sheets] Sync complete [org:${organizationId}]: ${synced} new, ${updated} updated, ${skipped} existing, ${errors.length} errors`);
  return { synced, updated, skipped, errors, totalRows: dataRows.length };
};

// ── Auto-sync all orgs ────────────────────────────────────────────────────
const autoSyncAllOrgs = async () => {
  try {
    const orgs = await Organization.find({
      'googleSheets.syncEnabled': true,
      'googleSheets.sheetId': { $exists: true, $ne: '' },
    });

    for (const org of orgs) {
      try {
        const { sheetId, sheetGid, sheetName, defaultAssignTo, columnMap } = org.googleSheets;
        const result = await syncLeadsFromSheet(
          org._id, sheetId, sheetGid || '', sheetName || 'Sheet1', defaultAssignTo, columnMap || {}
        );
        await Organization.findByIdAndUpdate(org._id, {
          'googleSheets.lastSyncedAt': new Date(),
          'googleSheets.lastSyncResult': result,
        });
        if (result.synced > 0) logger.info(`[Sheets] Auto-sync [${org.name}]: ${result.synced} new leads`);
      } catch (err) {
        await Organization.findByIdAndUpdate(org._id, {
          'googleSheets.lastSyncedAt': new Date(),
          'googleSheets.lastSyncResult': { error: err.message },
        });
        logger.error(`[Sheets] Auto-sync failed [${org.name}]: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`[Sheets] autoSyncAllOrgs error: ${err.message}`);
  }
};

// ── Preview: fetch first 5 rows to show user what will be synced ──────────
const previewSheet = async (sheetId, gid = '') => {
  const csvText = await fetchSheetCSV(sheetId, gid);
  const rows = parseCSV(csvText);
  if (rows.length < 2) return { headers: [], preview: [], totalRows: 0 };

  const headers = rows[0];
  const dataRows = rows.slice(1, 6); // first 5 data rows

  const mappedHeaders = headers.map((h) => ({
    raw: h,
    mapped: resolveHeader(h, {}),
  }));

  return {
    headers: mappedHeaders,
    preview: dataRows.map((row) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    }),
    totalRows: rows.length - 1,
  };
};

// ── Write-back: CRM → Google Sheets ──────────────────────────────────────

const hasWriteCredentials = () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  return !!(email && key && !email.includes('your_service') && !key.includes('YOUR_KEY'));
};

const getWriteApiClient = async () => {
  if (!hasWriteCredentials()) throw new Error('Google Service Account not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY to .env');
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
};

// Map a lead to a row array aligned to the sheet's existing headers
const buildLeadRow = (lead, headers) => {
  const assignedName = lead.assignedTo && typeof lead.assignedTo === 'object'
    ? `${lead.assignedTo.firstName || ''} ${lead.assignedTo.lastName || ''}`.trim()
    : '';

  const FIELD_VALUES = {
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    company: lead.company || '',
    city: lead.city || '',
    state: lead.state || '',
    notes: lead.notes || '',
    priority: lead.priority || '',
    rawStatus: lead.status || '',
    estimatedValue: lead.estimatedValue != null ? String(lead.estimatedValue) : '',
    source: lead.source || '',
    rawAssignedTo: assignedName,
    designation: lead.designation || '',
  };

  return headers.map((header) => {
    const field = resolveHeader(header, {});
    return field ? (FIELD_VALUES[field] || '') : '';
  });
};

const STANDARD_HEADERS = ['Name', 'Phone', 'Email', 'Company', 'City', 'State', 'Source', 'Status', 'Priority', 'Notes', 'Estimated Value'];

// Append a CRM-created lead as a new row in the sheet
const appendLeadToSheet = async (org, lead) => {
  if (!hasWriteCredentials()) return null;
  const gs = org.googleSheets || {};
  if (!gs.sheetId || !gs.writeBackEnabled) return null;

  try {
    const sheets = await getWriteApiClient();
    const sheetName = gs.sheetName || 'Sheet1';

    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: gs.sheetId,
      range: `${sheetName}!1:1`,
    });
    let headers = headerRes.data.values?.[0] || [];

    if (!headers.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: gs.sheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [STANDARD_HEADERS] },
      });
      headers = STANDARD_HEADERS;
    }

    const endCol = String.fromCharCode(64 + Math.max(headers.length, 1));
    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId: gs.sheetId,
      range: `${sheetName}!A:${endCol}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [buildLeadRow(lead, headers)] },
    });

    const updatedRange = appendRes.data.updates?.updatedRange || '';
    const rowMatch = updatedRange.match(/!A(\d+)/);
    if (rowMatch && lead._id) {
      const rowNum = parseInt(rowMatch[1]);
      const rowKey = `${gs.sheetId}_${gs.sheetGid || ''}_row_${rowNum}`;
      await Lead.findByIdAndUpdate(lead._id, {
        sheetRowId: rowKey,
        sheetId: gs.sheetId,
        lastSyncedAt: new Date(),
      });
    }

    logger.info(`[Sheets] Write-back: appended lead "${lead.name}" → ${updatedRange}`);
    return true;
  } catch (err) {
    logger.error(`[Sheets] appendLeadToSheet error: ${err.message}`);
    return null;
  }
};

// Update the existing row in the sheet when a CRM lead is modified
const updateLeadInSheet = async (org, lead) => {
  if (!hasWriteCredentials()) return null;
  const gs = org.googleSheets || {};
  if (!gs.sheetId || !gs.writeBackEnabled) return null;
  if (!lead.sheetRowId) return appendLeadToSheet(org, lead);

  const rowMatch = lead.sheetRowId.match(/_row_(\d+)$/);
  if (!rowMatch) return null;
  const rowNum = parseInt(rowMatch[1]);

  try {
    const sheets = await getWriteApiClient();
    const sheetName = gs.sheetName || 'Sheet1';

    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: gs.sheetId,
      range: `${sheetName}!1:1`,
    });
    const headers = headerRes.data.values?.[0] || STANDARD_HEADERS;
    const endCol = String.fromCharCode(64 + Math.max(headers.length, 1));

    await sheets.spreadsheets.values.update({
      spreadsheetId: gs.sheetId,
      range: `${sheetName}!A${rowNum}:${endCol}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [buildLeadRow(lead, headers)] },
    });

    logger.info(`[Sheets] Write-back: updated lead "${lead.name}" at row ${rowNum}`);
    return true;
  } catch (err) {
    logger.error(`[Sheets] updateLeadInSheet error: ${err.message}`);
    return null;
  }
};

module.exports = {
  syncLeadsFromSheet,
  autoSyncAllOrgs,
  previewSheet,
  appendLeadToSheet,
  updateLeadInSheet,
  hasWriteCredentials,
};
