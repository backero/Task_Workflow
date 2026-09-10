const { Readable } = require('stream');
const { google } = require('googleapis');
const logger = require('../utils/logger');
const GoogleDriveAuth = require('../models/GoogleDriveAuth');

// Document Wallet storage: OAuth as a real Google account, not a service
// account. Google blocks service accounts from owning files in a personal
// "My Drive" (they have no storage quota of their own) unless the target is
// a Shared Drive or Workspace domain-wide delegation is used — neither of
// which personal @gmail.com accounts support. So an admin connects their own
// Google account once (see driveConnectUrl/driveCallback in the controller);
// uploads then run as that person, using their own Drive quota.

const REDIRECT_PATH = '/api/documents/drive/callback';

function getRedirectUri() {
  const base = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || 'http://localhost:5000';
  return `${base}${REDIRECT_PATH}`;
}

function getOAuthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, getRedirectUri());
}

const hasClientCredentials = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

let cachedClient = null;

async function getAuthorizedClient() {
  if (cachedClient) return cachedClient;
  if (!hasClientCredentials()) return null;
  const doc = await GoogleDriveAuth.findOne({}).select('+refreshToken');
  if (!doc) return null;
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: doc.refreshToken });
  cachedClient = client;
  return client;
}

function invalidateCache() {
  cachedClient = null;
}

async function hasWriteCredentials() {
  if (!hasClientCredentials() || !process.env.GOOGLE_DRIVE_FOLDER_ID) return false;
  return !!(await getAuthorizedClient());
}

async function getDriveClient() {
  const auth = await getAuthorizedClient();
  if (!auth) throw new Error('Document storage is not configured yet.');
  return google.drive({ version: 'v3', auth });
}

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
  const drive = await getDriveClient();
  const folderId = await ensureDocFolder(drive, orgFolderName, categoryName, docName);
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: mimeType || 'application/octet-stream', body: Readable.from(buffer) },
    fields: 'id, webViewLink, size',
  });
  return { driveId: res.data.id, driveLink: res.data.webViewLink };
}

async function streamFile(fileId, res) {
  const drive = await getDriveClient();
  const meta = await drive.files.get({ fileId, fields: 'name, mimeType' });
  res.setHeader('Content-Type', meta.data.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.data.name)}"`);
  const dl = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  dl.data.pipe(res);
}

async function deleteFile(fileId) {
  if (!fileId) return;
  try {
    const drive = await getDriveClient();
    await drive.files.delete({ fileId });
  } catch (err) {
    // already gone / not accessible — Mongo is the source of truth for what "exists"
    logger.warn(`[GoogleDrive] deleteFile(${fileId}) failed: ${err.message}`);
  }
}

function getConnectUrl(state) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/userinfo.email'],
    state,
  });
}

async function completeConnect(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token. Revoke prior access at https://myaccount.google.com/permissions and try connecting again.');
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  return { refreshToken: tokens.refresh_token, email: data.email };
}

module.exports = {
  hasWriteCredentials, uploadBuffer, streamFile, deleteFile,
  getConnectUrl, completeConnect, invalidateCache,
};
