const express = require('express');
const router = express.Router();

const authRoutes         = require('./auth.routes');
const orgRoutes          = require('./org.routes');
const projectRoutes      = require('./project.routes');
const taskRoutes         = require('./task.routes');
const notificationRoutes = require('./notification.routes');
const userRoutes         = require('./user.routes');
const analyticsRoutes    = require('./analytics.routes');
const dashboardRoutes    = require('./dashboard.routes');
const employeeRoutes     = require('./employee.routes');
const inventoryRoutes    = require('./inventory.routes');
const financeRoutes      = require('./finance.routes');
const searchRoutes       = require('./search.routes');
const labelRoutes        = require('./label.routes');
const timeLogRoutes      = require('./timeLog.routes');
const exportRoutes       = require('./export.routes');
const reportsRoutes      = require('./reports.routes');
const importRoutes       = require('./import.routes');
const uploadRoutes       = require('./upload.routes');
const productionRoutes   = require('./production.routes');

router.use('/auth',          authRoutes);
router.use('/org',           orgRoutes);
router.use('/projects',      projectRoutes);
router.use('/tasks',         taskRoutes);
router.use('/notifications', notificationRoutes);
router.use('/users',         userRoutes);
router.use('/analytics',     analyticsRoutes);
router.use('/dashboard',     dashboardRoutes);
router.use('/employees',     employeeRoutes);
router.use('/inventory',     inventoryRoutes);
router.use('/finance',       financeRoutes);
router.use('/search',        searchRoutes);
router.use('/labels',        labelRoutes);
router.use('/time-logs',     timeLogRoutes);
router.use('/export',        exportRoutes);
router.use('/reports',       reportsRoutes);
router.use('/import',        importRoutes);
router.use('/upload',        uploadRoutes);
router.use('/production',    productionRoutes);

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Backero API is running', timestamp: new Date().toISOString() });
});

router.get('/wa-status', (req, res) => {
  const { WHATSAPP_PROVIDER } = require('../config/env');
  const waReady = WHATSAPP_PROVIDER === 'local'
    ? require('../services/wa-client').isReady()
    : null;
  res.json({
    success: true,
    provider: WHATSAPP_PROVIDER,
    connected: waReady,
    message: WHATSAPP_PROVIDER === 'local'
      ? (waReady ? 'WhatsApp connected and ready' : 'WhatsApp connecting — check terminal for QR code')
      : `Using provider: ${WHATSAPP_PROVIDER}`,
  });
});

router.post('/admin/trigger-daily-report', async (req, res) => {
  try {
    const { runDailyOrgReport } = require('../jobs/reminderJob');
    runDailyOrgReport(); // fire & forget
    res.json({ success: true, message: 'Daily report triggered — check WhatsApp in a few seconds' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/whatsapp/qr', async (req, res) => {
  const { WHATSAPP_PROVIDER } = require('../config/env');
  if (WHATSAPP_PROVIDER !== 'local') {
    return res.status(400).json({ success: false, message: 'QR only available for local provider' });
  }
  const waClient = require('../services/wa-client');
  if (waClient.isReady()) {
    return res.send('<h2 style="font-family:sans-serif;color:green">✅ WhatsApp already connected!</h2>');
  }
  const qr = waClient.getLatestQR();
  if (!qr) {
    return res.send('<h2 style="font-family:sans-serif;color:orange">⏳ QR not ready yet — refresh in 3 seconds</h2><meta http-equiv="refresh" content="3">');
  }
  const QRCode = require('qrcode');
  const imgDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
  res.send(`<!DOCTYPE html>
<html><head><title>Scan WhatsApp QR</title>
<meta http-equiv="refresh" content="30">
<style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f2f5;}
.card{background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.12);text-align:center;}
h2{color:#128C7E;margin:0 0 8px;}p{color:#555;margin:0 0 24px;font-size:14px;}
img{border-radius:8px;}small{display:block;color:#999;margin-top:16px;font-size:12px;}</style>
</head><body><div class="card">
<h2>Scan with WhatsApp</h2>
<p>Phone → Settings → Linked Devices → Link a Device</p>
<img src="${imgDataUrl}" width="300" height="300" />
<small>Auto-refreshes every 30 seconds. Close tab once connected.</small>
</div></body></html>`);
});

module.exports = router;
