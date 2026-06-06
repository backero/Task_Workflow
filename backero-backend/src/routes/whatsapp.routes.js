const router = require('express').Router();
const QRCode = require('qrcode');
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeAdminOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess } = require('../utils/helpers');
const { getStatus, getQRCode, isConnected, reinitWhatsApp, sendTaskAssigned } = require('../services/whatsapp.service');
const { runDailyReport } = require('../services/automation.service');
const Task = require('../models/Task');
const User = require('../models/User');

// ── Public endpoints — no auth needed (only for initial WA setup) ─────────────
// GET /api/whatsapp/setup — auto-refreshing HTML page for QR scanning
router.get('/setup', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Backero — WhatsApp Setup</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:sans-serif;background:#0f172a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;gap:20px}
  h2{margin:0;font-size:1.3rem;color:#93c5fd}
  #status{font-size:.9rem;color:#94a3b8;min-height:1.2em}
  #qr{width:280px;height:280px;background:#1e293b;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden}
  #qr img{width:280px;height:280px;display:none}
  #spinner{font-size:2rem;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .connected{color:#4ade80!important}
</style></head><body>
<h2>Backero WhatsApp Setup</h2>
<div id="qr"><span id="spinner">⟳</span><img id="img" alt="QR Code"></div>
<div id="status">Waiting for QR…</div>
<script>
const imgUrl='${host}/api/whatsapp/qr/image';
function poll(){
  fetch('/api/whatsapp/qr/image',{cache:'no-store'})
    .then(r=>{
      if(r.ok){
        document.getElementById('img').src=imgUrl+'?t='+Date.now();
        document.getElementById('img').style.display='block';
        document.getElementById('spinner').style.display='none';
        document.getElementById('status').textContent='Scan with WhatsApp → Linked Devices → Link a Device';
        setTimeout(poll,5000);
      } else {
        return r.json().then(d=>{
          document.getElementById('img').style.display='none';
          document.getElementById('spinner').style.display='';
          if(d.status==='connected'){
            document.getElementById('status').className='connected';
            document.getElementById('status').textContent='✅ WhatsApp Connected!';
          } else {
            document.getElementById('status').textContent=d.message||'Waiting…';
            setTimeout(poll,3000);
          }
        });
      }
    }).catch(()=>setTimeout(poll,3000));
}
poll();
</script></body></html>`);
});

// GET /api/whatsapp/qr/image — returns QR as PNG image
router.get('/qr/image', asyncHandler(async (req, res) => {
  const qrString = getQRCode();
  if (!qrString) {
    const status = getStatus();
    const msg = isConnected() ? 'Already connected' :
      status === 'unavailable' ? 'WhatsApp init failed — check server logs' :
      'QR not ready yet — refresh in 5s';
    return res.status(404).json({ success: false, message: msg, status });
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

// POST /api/whatsapp/reconnect — force disconnect + reinit (generates new QR)
router.post('/reconnect', asyncHandler(async (req, res) => {
  reinitWhatsApp().catch(() => {});
  sendSuccess(res, {}, 'WhatsApp reinitialising — scan new QR at /api/whatsapp/qr/image in 5 seconds');
}));

// POST /api/whatsapp/test-report — manually trigger daily report
// Body: { phones: ['9999999999', ...] } (optional — defaults to all admins)
router.post('/test-report', asyncHandler(async (req, res) => {
  const phones = Array.isArray(req.body?.phones) && req.body.phones.length > 0 ? req.body.phones : null;
  runDailyReport(phones).catch(() => {});
  sendSuccess(res, {}, `Daily report triggered → ${phones ? phones.join(', ') : 'all admins'} — check WhatsApp in 10 seconds`);
}));

// POST /api/whatsapp/notify-assignments
// Sends task-assigned WhatsApp to every active assignee in the org for tasks missing their WA notification.
// Body: { taskIds: [...] } — optional array of specific task IDs; omit to send for ALL active assigned tasks
router.post('/notify-assignments', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const specificIds = Array.isArray(req.body?.taskIds) && req.body.taskIds.length > 0 ? req.body.taskIds : null;

  const filter = {
    organizationId: orgId,
    assignedTo: { $ne: null },
    status: { $nin: ['Completed', 'Cancelled'] },
  };
  if (specificIds) filter._id = { $in: specificIds };

  const tasks = await Task.find(filter)
    .populate('assignedTo', 'firstName lastName phone whatsapp')
    .populate('assignedBy',  'firstName lastName')
    .lean();

  let sent = 0, skipped = 0;
  for (const task of tasks) {
    const phone = task.assignedTo?.whatsapp || task.assignedTo?.phone;
    if (!phone) { skipped++; continue; }
    const assignedByName = task.assignedBy
      ? `${task.assignedBy.firstName} ${task.assignedBy.lastName}`
      : 'Admin';
    await sendTaskAssigned(phone, {
      title: task.title,
      assignedByName,
      priority: task.priority,
      department: task.department,
      dueDate: task.dueDate,
      description: task.description,
    });
    sent++;
  }

  sendSuccess(res, { sent, skipped, total: tasks.length },
    `Assignment notifications sent: ${sent} WhatsApp messages, ${skipped} skipped (no phone)`);
}));

module.exports = router;
