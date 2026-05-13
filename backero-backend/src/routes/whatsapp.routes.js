const router = require('express').Router();
const QRCode = require('qrcode');
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeAdminOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess } = require('../utils/helpers');
const { getStatus, getQRCode, isConnected } = require('../services/whatsapp.service');
const { runDailyReport } = require('../services/automation.service');

// ── Public endpoint — no auth needed (only for initial WA setup) ──────────────
// GET /api/whatsapp/qr/image — returns QR as PNG image
router.get('/qr/image', asyncHandler(async (req, res) => {
  const qrString = getQRCode();
  if (!qrString) {
    return res.status(404).json({ success: false, message: isConnected() ? 'Already connected' : 'QR not ready yet — refresh in 5s' });
  }
  const buffer = await QRCode.toBuffer(qrString, { width: 320, margin: 2 });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(buffer);
}));

// ── Protected routes ──────────────────────────────────────────────────────────
router.use(authenticate, authorizeAdminOrAbove);

// GET /api/whatsapp/status
router.get('/status', asyncHandler(async (req, res) => {
  sendSuccess(res, {
    status: getStatus(),
    connected: isConnected(),
    hasQR: !!getQRCode(),
  });
}));

// GET /api/whatsapp/qr — returns QR as base64 PNG image
router.get('/qr', asyncHandler(async (req, res) => {
  const qrString = getQRCode();

  if (isConnected()) {
    return sendSuccess(res, { connected: true, qrImage: null, message: 'WhatsApp is already connected' });
  }

  if (!qrString) {
    return sendSuccess(res, { connected: false, qrImage: null, message: 'QR not ready yet — server is initialising, refresh in 5 seconds' });
  }

  // Convert Baileys QR string → base64 PNG
  const qrImage = await QRCode.toDataURL(qrString, { width: 300, margin: 2 });
  sendSuccess(res, { connected: false, qrImage, message: 'Scan with WhatsApp on your phone' });
}));

// POST /api/whatsapp/test-report — manually trigger daily report
// Body: { phones: ['9999999999', ...] } (optional — defaults to all admins)
router.post('/test-report', asyncHandler(async (req, res) => {
  const phones = Array.isArray(req.body?.phones) && req.body.phones.length > 0 ? req.body.phones : null;
  runDailyReport(phones).catch(() => {});
  sendSuccess(res, {}, `Daily report triggered → ${phones ? phones.join(', ') : 'all admins'} — check WhatsApp in 10 seconds`);
}));

module.exports = router;
