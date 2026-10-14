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
const crmRoutes          = require('./crm.routes');
const marketingRoutes    = require('./marketing.routes');

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
router.use('/crm',           crmRoutes);
router.use('/marketing',     marketingRoutes);

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
    return res.send(`<!DOCTYPE html><html><head><title>WhatsApp</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f2f5;}
.card{background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.12);text-align:center;}
h2{color:#25D366;}</style></head><body><div class="card">
<h2>✅ WhatsApp Connected!</h2><p style="color:#555">Your WhatsApp is active and ready to send messages.</p>
</div></body></html>`);
  }
  const qr = waClient.getLatestQR();
  if (!qr) {
    return res.send(`<!DOCTYPE html><html><head><title>WhatsApp QR</title>
<meta http-equiv="refresh" content="3">
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f2f5;}
.card{background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.12);text-align:center;}
h2{color:#f59e0b;}p{color:#555;margin:0 0 16px;}a{color:#ef4444;font-weight:bold;}</style></head>
<body><div class="card">
<h2>⏳ Generating QR…</h2>
<p>WhatsApp is initialising. This page will refresh automatically.</p>
<p>If the QR doesn't appear after 15 seconds, <a href="/api/whatsapp/reset">click here to reset the session</a>.</p>
</div></body></html>`);
  }
  const QRCode = require('qrcode');
  const imgDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
  res.send(`<!DOCTYPE html>
<html><head><title>Scan WhatsApp QR</title>
<style>
body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f2f5;}
.card{background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.12);text-align:center;max-width:380px;width:90%;}
h2{color:#128C7E;margin:0 0 8px;}p{color:#555;margin:0 0 20px;font-size:14px;}
img{border-radius:8px;border:2px solid #e5e7eb;}
.status{margin-top:16px;font-size:13px;color:#6b7280;}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;margin-right:6px;animation:pulse 1.5s infinite;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
.connected{color:#16a34a;font-weight:600;font-size:15px;}
</style>
</head><body><div class="card">
<h2>📱 Scan with WhatsApp</h2>
<p>Phone → Settings → Linked Devices → Link a Device</p>
<img src="${imgDataUrl}" width="280" height="280" />
<div class="status" id="status"><span class="dot"></span>Waiting for scan…</div>
</div>
<script>
// Poll every 3 seconds — show connected message immediately after scan
const poll = setInterval(async () => {
  try {
    const r = await fetch('/api/wa-status');
    const d = await r.json();
    if (d.connected) {
      clearInterval(poll);
      document.getElementById('status').innerHTML = '<span class="connected">✅ Connected! You can close this tab.</span>';
      document.querySelector('img').style.opacity = '0.3';
    }
  } catch(e) {}
}, 3000);
</script>
</body></html>`);
});

/* Force-clear the WhatsApp session so a fresh QR is generated */
router.get('/whatsapp/reset', async (req, res) => {
  const { WHATSAPP_PROVIDER } = require('../config/env');
  if (WHATSAPP_PROVIDER !== 'local') {
    return res.status(400).json({ success: false, message: 'Reset only available for local provider' });
  }
  try {
    const path = require('path');
    const fs   = require('fs');
    const sessionPath = path.join(__dirname, '../../wa-session');
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
    // Re-initialise the client — it will generate a fresh QR
    const waClient = require('../services/wa-client');
    waClient.init().catch(() => {});
    res.send(`<!DOCTYPE html><html><head><title>WhatsApp Reset</title>
<meta http-equiv="refresh" content="5;url=/api/whatsapp/qr">
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f2f5;}
.card{background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.12);text-align:center;}
h2{color:#128C7E;}p{color:#555;}</style></head>
<body><div class="card">
<h2>🔄 Session Cleared</h2>
<p>Generating fresh QR code…<br>Redirecting to QR page in 5 seconds.</p>
<p><a href="/api/whatsapp/qr">Click here if not redirected</a></p>
</div></body></html>`);
  } catch (err) {
    res.status(500).json({ success: false, message: `Reset failed: ${err.message}` });
  }
});

module.exports = router;
