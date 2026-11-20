const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// PM2 can retain an old environment value across restarts. For Cloudinary
// specifically, prefer the server's current .env file when it is present so
// a rotated media credential takes effect without inheriting a stale process
// value. The fallback keeps normal managed-environment deployments working.
let fileConfig = {};
try {
  fileConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../../.env')));
} catch {
  // A managed runtime may inject credentials without an .env file.
}

cloudinary.config({
  cloud_name: fileConfig.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    fileConfig.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY,
  api_secret: fileConfig.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET,
});

async function uploadBuffer(buffer, { folder = 'backero', resourceType = 'image', transformation, filename, authenticated = false } = {}) {
  return new Promise((resolve, reject) => {
    const options = { folder, resource_type: resourceType, transformation };
    // Raw (non-image) delivery infers Content-Type from the extension on the stored
    // public_id — without this, Cloudinary serves every raw file (PDF, Word, Excel, CSV)
    // as application/octet-stream, which browsers refuse to render inline and instead
    // try to download. Preserving the original filename keeps its extension intact.
    if (filename) {
      options.use_filename = true;
      options.unique_filename = true;
      options.filename_override = filename;
    }
    // Cloudinary blocks public delivery of PDF/ZIP raw files by default on this account
    // (returns 401 "deny or ACL failure" even with the dashboard restriction lifted) —
    // authenticated delivery isn't subject to that block, so we sign the URL ourselves
    // instead of relying on the public one. sign_url (unlike token-based auth) doesn't
    // expire, so this is safe to store permanently on the attachment record.
    if (authenticated) options.type = 'authenticated';
    const stream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => {
        if (err) return reject(err);
        if (authenticated) {
          result.secure_url = cloudinary.url(result.public_id, {
            resource_type: result.resource_type,
            type: 'authenticated',
            sign_url: true,
            secure: true,
          });
        }
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

async function deleteByPublicId(publicId) {
  return cloudinary.uploader.destroy(publicId);
}

module.exports = { uploadBuffer, deleteByPublicId };
