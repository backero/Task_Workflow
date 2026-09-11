const multer = require('multer');

// Raw media for the social automation engine (manual post creation, raw
// video ingest) — kept in memory just long enough to forward to the Python
// engine as multipart, never written to disk here.
const socialMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    ok ? cb(null, true) : cb(new Error('Only image or video files are allowed'));
  },
});

module.exports = socialMediaUpload;
