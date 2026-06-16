const router = require('express').Router();
const QRCode = require('qrcode');
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeAdminOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess } = require('../utils/helpers');
const { getStatus, getQRCode, isConnected, reinitWhatsApp, sendTaskAssigned, getJoinedGroups, joinGroupViaLink, getDebugInfo, sendGroupMessage, sendTaskOverdueGroup } = require('../services/whatsapp.service');
const { runDailyReport, runOverdueTaskCheck } = require('../services/automation.service');
const Task = require('../models/Task');
const User = require('../models/User');
const Department = require('../models/Department');
const Organization = require('../models/Organization');
const logger = require('../utils/logger');

// ── Public endpoints — no auth needed (only for initial WA setup) ─────────────

// POST /api/whatsapp/force-qr — public; clears session + forces fresh QR generation
// Used by setup page when QR never appears (stuck in connecting / 440 loop)
let _lastForceQR = 0;
router.post('/force-qr', (req, res) => {
  if (isConnected()) {
    return res.json({ success: true, message: 'Already connected', status: 'connected' });
  }
  const now = Date.now();
  if (now - _lastForceQR < 30000) {
    return res.json({ success: false, message: 'Too soon — wait 30s before retrying', status: getStatus() });
  }
  _lastForceQR = now;
  logger.info('[WhatsApp] force-qr triggered via setup page — clearing session and reinitialising');
  reinitWhatsApp().catch((err) => logger.error(`[WhatsApp] force-qr reinit error: ${err.message}`));
  res.json({ success: true, message: 'Reinitialising — QR should appear in 5–10 seconds', status: 'reinitialising' });
});

// GET /api/whatsapp/debug — public; shows internal WA state (no auth)
router.get('/debug', (req, res) => {
  res.json({ ...getDebugInfo(), timestamp: new Date().toISOString() });
});

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
  #status{font-size:.9rem;color:#94a3b8;min-height:1.2em;text-align:center}
  #qr{width:280px;height:280px;background:#1e293b;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden}
  #qr img{width:280px;height:280px;display:none}
  #spinner{font-size:2rem;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .connected{color:#4ade80!important}
  #forceBtn{display:none;padding:10px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:.9rem;cursor:pointer;margin-top:4px}
  #forceBtn:hover{background:#2563eb}
  #forceBtn:disabled{background:#475569;cursor:not-allowed}
  #timer{font-size:.75rem;color:#64748b}
</style></head><body>
<h2>Backero WhatsApp Setup</h2>
<div id="qr"><span id="spinner">⟳</span><img id="img" alt="QR Code"></div>
<div id="status">Waiting for QR…</div>
<div id="timer"></div>
<button id="forceBtn" onclick="forceQR()">Force QR Generation</button>
<script>
const imgUrl='${host}/api/whatsapp/qr/image';
let waitSec=0, forceTriggered=false, pollTimer=null;

function poll(){
  fetch('/api/whatsapp/qr/image',{cache:'no-store'})
    .then(r=>{
      if(r.ok){
        document.getElementById('img').src=imgUrl+'?t='+Date.now();
        document.getElementById('img').style.display='block';
        document.getElementById('spinner').style.display='none';
        document.getElementById('status').textContent='Scan with WhatsApp → Linked Devices → Link a Device';
        document.getElementById('forceBtn').style.display='none';
        document.getElementById('timer').textContent='';
        forceTriggered=false; waitSec=0;
        pollTimer=setTimeout(poll,5000);
      } else {
        return r.json().then(d=>{
          document.getElementById('img').style.display='none';
          document.getElementById('spinner').style.display='';
          if(d.status==='connected'){
            document.getElementById('status').className='connected';
            document.getElementById('status').textContent='✅ WhatsApp Connected! OTP delivery is now active.';
            document.getElementById('forceBtn').style.display='none';
            document.getElementById('timer').textContent='';
          } else {
            document.getElementById('status').textContent=d.message||'Waiting…';
            waitSec+=3;
            if(waitSec>=60 && !forceTriggered){
              forceTriggered=true;
              document.getElementById('timer').textContent='Auto-triggering QR reset…';
              forceQR();
            } else if(waitSec>=30){
              document.getElementById('forceBtn').style.display='inline-block';
              document.getElementById('timer').textContent='Waited '+waitSec+'s — click button to force QR';
            }
            pollTimer=setTimeout(poll,3000);
          }
        });
      }
    }).catch(()=>{pollTimer=setTimeout(poll,3000);});
}

function forceQR(){
  const btn=document.getElementById('forceBtn');
  btn.disabled=true; btn.textContent='Resetting…';
  document.getElementById('timer').textContent='Clearing session — QR will appear in 5–10s';
  fetch('/api/whatsapp/force-qr',{method:'POST',cache:'no-store'})
    .then(r=>r.json())
    .then(d=>{
      document.getElementById('status').textContent=d.message||'Reinitialising…';
      waitSec=0;
      setTimeout(()=>{ btn.disabled=false; btn.textContent='Force QR Generation'; },32000);
    })
    .catch(()=>{ btn.disabled=false; btn.textContent='Force QR Generation'; });
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

// POST /api/whatsapp/run-overdue-check — manually run overdue task check right now
router.post('/run-overdue-check', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  if (!isConnected()) return res.status(503).json({ success: false, message: 'WhatsApp not connected' });
  runOverdueTaskCheck().catch(logger.error);
  sendSuccess(res, {}, 'Overdue check triggered — alerts will be sent to department groups in a few seconds');
}));

// POST /api/whatsapp/departments/:id/test — send a test message to department group
router.post('/departments/:id/test', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  if (!isConnected()) return res.status(503).json({ success: false, message: 'WhatsApp not connected' });
  const dept = await Department.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
  if (!dept.whatsappGroupId) return res.status(400).json({ success: false, message: 'No WhatsApp group linked for this department' });

  // Find actual overdue tasks for this dept and send real alert
  const { TASK_STATUS } = require('../utils/constants');
  const overdueTasks = await Task.find({
    organizationId: req.user.organizationId,
    department: dept.name,
    isOverdue: true,
    status: { $nin: [TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED] },
  }).populate('assignedTo', 'firstName lastName').limit(5);

  if (overdueTasks.length > 0) {
    for (const task of overdueTasks) {
      const empName = task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : 'Unassigned';
      await sendTaskOverdueGroup(dept.whatsappGroupId, {
        title: task.title, employeeName: empName,
        department: dept.name, dueDate: task.dueDate,
        priority: task.priority, overdueCount: task.overdueNotificationsSent || 1, taskId: task._id,
      });
    }
    sendSuccess(res, { sent: overdueTasks.length }, `Sent ${overdueTasks.length} overdue alert(s) to ${dept.name} group`);
  } else {
    await sendGroupMessage(dept.whatsappGroupId,
      `✅ *${dept.name} — Test Alert*\n\nBackero WhatsApp group is connected and working!\nNo overdue tasks right now.\n\n_Backero Task Management_`
    );
    sendSuccess(res, {}, `Test message sent to ${dept.name} group`);
  }
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

// GET /api/whatsapp/groups — list all WA groups the bot has joined
router.get('/groups', asyncHandler(async (req, res) => {
  const groups = await getJoinedGroups();
  sendSuccess(res, { groups, count: groups.length });
}));

// POST /api/whatsapp/departments/:id/join-group — bot joins via invite link + auto-saves JID
// Body: { inviteLink: 'https://chat.whatsapp.com/XXXXX' }
router.post('/departments/:id/join-group', asyncHandler(async (req, res) => {
  const { inviteLink } = req.body;
  if (!inviteLink) return res.status(400).json({ success: false, message: 'inviteLink is required' });

  const groupJid = await joinGroupViaLink(inviteLink);

  const dept = await Department.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { whatsappGroupId: groupJid },
    { new: true },
  ).select('name whatsappGroupId');
  if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });

  sendSuccess(res, { department: dept.name, whatsappGroupId: groupJid },
    `Bot joined group and linked to ${dept.name}`);
}));

// POST /api/whatsapp/departments/:id/group — set department's WA group JID
// Body: { groupJid: '120363XXXXXX@g.us' }  OR  { groupJid: null } to clear
router.post('/departments/:id/group', asyncHandler(async (req, res) => {
  const { groupJid } = req.body;
  const dept = await Department.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { whatsappGroupId: groupJid || null },
    { new: true },
  ).select('name whatsappGroupId');
  if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
  sendSuccess(res, { department: dept.name, whatsappGroupId: dept.whatsappGroupId },
    groupJid ? `Group set for ${dept.name}` : `Group cleared for ${dept.name}`);
}));

// POST /api/whatsapp/crm/join-group — bot joins via invite link + saves JID for CRM lead alerts
router.post('/crm/join-group', asyncHandler(async (req, res) => {
  const { inviteLink } = req.body;
  if (!inviteLink) return res.status(400).json({ success: false, message: 'inviteLink is required' });

  const groupJid = await joinGroupViaLink(inviteLink);

  await Organization.findByIdAndUpdate(req.user.organizationId, { crmLeadGroupId: groupJid });

  sendSuccess(res, { groupJid }, 'Bot joined CRM group — new lead alerts enabled');
}));

// POST /api/whatsapp/crm/group — manually set or clear CRM group JID
router.post('/crm/group', asyncHandler(async (req, res) => {
  const { groupJid } = req.body;
  await Organization.findByIdAndUpdate(req.user.organizationId, { crmLeadGroupId: groupJid || null });
  sendSuccess(res, { groupJid: groupJid || null },
    groupJid ? 'CRM lead group set' : 'CRM lead group cleared');
}));

module.exports = router;
