const fs = require('fs');
const path = require('path');

// Fallback storage used when Google Drive isn't configured (no OAuth client
// credentials set) — keeps the Document Wallet usable without Drive. Defaults
// to uploads/ (gitignored, same as other local-storage folders), but on a
// platform with an ephemeral filesystem (e.g. Render without a mounted disk)
// this default does not survive a redeploy — point DOCUMENT_STORAGE_DIR at a
// persistent disk's mount path there, the same way WA_SESSION_PATH does for
// the WhatsApp session store.
const STORAGE_DIR = process.env.DOCUMENT_STORAGE_DIR || path.join(__dirname, '..', '..', 'uploads', 'documents');

function filePath(fileId) {
  return path.join(STORAGE_DIR, fileId);
}

function exists(fileId) {
  return fs.existsSync(filePath(fileId));
}

function save(buffer, fileId) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.writeFileSync(filePath(fileId), buffer);
}

function stream(fileId) {
  return fs.createReadStream(filePath(fileId));
}

function remove(fileId) {
  try {
    fs.unlinkSync(filePath(fileId));
  } catch (err) {
    // already gone — fine, Mongo is the source of truth for what "exists"
  }
}

module.exports = { exists, save, stream, remove };
