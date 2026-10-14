const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.csv') ||
      file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel') || file.mimetype === 'text/csv';
    ok ? cb(null, true) : cb(new Error('Only .xlsx and .csv files are allowed'));
  },
});

module.exports = upload;
