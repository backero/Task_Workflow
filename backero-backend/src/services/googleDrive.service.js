const { Readable } = require('stream');
const logger = require('../utils/logger');

// Document Wallet storage: a single Google service account (already used for
// Google Sheets — see googleSheets.service.js) with a shared root Drive folder,
// scoped per-organization by a subfolder. Not per-user OAuth — no consent screen,
// no per-user tokens to manage. The root folder must be shared with
// GOOGLE_SERVICE_ACCOUNT_EMAIL as Editor (see .env.example for setup notes).

const hasWriteCredentials = () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  const folder = process.env.GOOGLE_DRIVE_FOLDER_ID;
  return !!(email && key && folder && !email.includes('your_service') && !key.includes('YOUR_KEY'));
};

let _drive = null;
const getClient = () => {
  if (_drive) return _drive;
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  _drive = google.drive({ version: 'v3', auth });
  return _drive;
};

const folderCache = new Map();

async function findOrCreateFolder(drive, name, parentId) {
  const key = `${parentId}/${name}`;
  if (folderCache.has(key)) return folderCache.get(key);

  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and '${parentId}' in parents and trashed=false`;
  const list = await drive.files.list({ q, fields: 'files(id,name)' });

  let id;
  if (list.data.files && list.data.files.length) {
    id = list.data.files[0].id;
  } else {
    const created = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    id = created.data.id;
  }
  folderCache.set(key, id);
  return id;
}

// root (GOOGLE_DRIVE_FOLDER_ID) / {orgFolderName} / {categoryName} / {docName}
async function ensureDocFolder(drive, orgFolderName, categoryName, docName) {
  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const orgId = await findOrCreateFolder(drive, orgFolderName || 'Organization', rootId);
  const catId = await findOrCreateFolder(drive, categoryName || 'Uncategorized', orgId);
  return findOrCreateFolder(drive, (docName || 'Untitled document').slice(0, 120), catId);
}

async function uploadBuffer(buffer, { filename, mimeType, orgFolderName, categoryName, docName }) {
  if (!hasWriteCredentials()) throw new Error('Document storage is not configured yet.');
  const drive = getClient();
  const folderId = await ensureDocFolder(drive, orgFolderName, categoryName, docName);
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: mimeType || 'application/octet-stream', body: Readable.from(buffer) },
    fields: 'id, webViewLink, size',
  });
  return { driveId: res.data.id, driveLink: res.data.webViewLink };
}

async function streamFile(fileId, res) {
  if (!hasWriteCredentials()) throw new Error('Document storage is not configured yet.');
  const drive = getClient();
  const meta = await drive.files.get({ fileId, fields: 'name, mimeType' });
  res.setHeader('Content-Type', meta.data.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.data.name)}"`);
  const dl = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  dl.data.pipe(res);
}

async function deleteFile(fileId) {
  if (!hasWriteCredentials() || !fileId) return;
  try {
    const drive = getClient();
    await drive.files.delete({ fileId });
  } catch (err) {
    // already gone / not accessible — Mongo is the source of truth for what "exists"
    logger.warn(`[GoogleDrive] deleteFile(${fileId}) failed: ${err.message}`);
  }
}

module.exports = { hasWriteCredentials, uploadBuffer, streamFile, deleteFile };
