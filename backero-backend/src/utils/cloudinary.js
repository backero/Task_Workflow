const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadBuffer(buffer, { folder = 'backero', resourceType = 'image', transformation, filename } = {}) {
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
    const stream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

async function deleteByPublicId(publicId) {
  return cloudinary.uploader.destroy(publicId);
}

module.exports = { uploadBuffer, deleteByPublicId };
