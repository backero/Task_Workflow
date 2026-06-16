const logger = require('../utils/logger');
const { useMongoAuthState, clearMongoSession } = require('./whatsappMongoAuth');

let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected';
let io_ref = null;
let isInitializing = false;
let lastError = null;
let _consecutive440s = 0;
let _lastConnectedAt = 0;   // timestamp of last successful connection.open
let _postConnectRetries = 0; // reconnect attempts within 2 min of a successful connect

// ── Helpers ───────────────────────────────────────────────────────────────────

// Properly close the socket WebSocket without logging out the linked device
const _closeSock = () => {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch {}
  try { sock.end(undefined); } catch {}  // close WebSocket cleanly
  sock = null;
};

// Schedule a fresh initWhatsApp after delayMs. Resets guard so it's never blocked.
const _scheduleReinit = (delayMs = 3000, clearSession = false) => {
  isInitializing = false;
  if (clearSession) {
    // Small pause so any in-flight MongoDB writes from the dying socket finish first
    setTimeout(async () => {
      await clearMongoSession().catch(() => {});
      setTimeout(() => initWhatsApp(io_ref), 500);
    }, 200);
  } else {
    setTimeout(() => initWhatsApp(io_ref), delayMs);
  }
};

// ── Init ──────────────────────────────────────────────────────────────────────
const initWhatsApp = async (io) => {
  if (isInitializing) {
    logger.warn('[WhatsApp] Init already in progress — ignoring duplicate call');
    return;
  }
  isInitializing = true;
  io_ref = io || io_ref;

  // Kill any lingering socket — must close WebSocket too, not just remove listeners.
  // Without sock.end(), the old TCP connection stays open and WhatsApp sees two
  // clients with the same credentials → immediate 440 on the new connection.
  _closeSock();

  connectionStatus = 'connecting';

  try {
    const baileys = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default ?? baileys.makeWASocket;
    const { DisconnectReason, fetchLatestBaileysVersion } = baileys;

    const { state, saveCreds } = await useMongoAuthState(baileys);

    // fetchLatestBaileysVersion hits GitHub and can hang — 10s timeout + stable fallback
    let version;
    try {
      const r = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
      ]);
      version = r?.version || [2, 3000, 1017531287];
    } catch {
      version = [2, 3000, 1017531287];
    }

    const hasCreds = !!state.creds?.me;
    logger.info(`[WhatsApp] Starting — version: ${version} | storedSession: ${hasCreds}`);

    // Watchdog: if no QR/connection after 60s, session is silently broken — clear + fresh QR
    // 60s gives Render cold starts (30s wake + 10s DB + 10s WA handshake) enough margin.
    const watchdog = setTimeout(async () => {
      if (connectionStatus === 'connecting') {
        logger.warn('[WhatsApp] Watchdog: stuck connecting 60s — clearing session for fresh QR');
        _closeSock();
        _scheduleReinit(2000, true);
      }
    }, 60000);

    const noop = () => {};
    const silentLogger = {
      level: 'silent', info: noop, warn: noop, error: noop,
      debug: noop, trace: noop, fatal: noop, child: () => silentLogger,
    };

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      browser: ['Backero', 'Chrome', '1.0.0'],
      generateHighQualityLinkPreview: false,
      getMessage: async () => undefined,
      logger: silentLogger,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        qrCode = qr;
        connectionStatus = 'qr_ready';
        logger.info('[WhatsApp] QR ready — open /api/whatsapp/setup to scan');
        io_ref?.emit('wa_qr', { qr });
      }

      if (connection === 'open') {
        clearTimeout(watchdog);
        qrCode = null;
        connectionStatus = 'connected';
        _consecutive440s = 0;
        _lastConnectedAt = Date.now();
        _postConnectRetries = 0;
        logger.info('[WhatsApp] ✅ Connected and ready');
        io_ref?.emit('wa_connected', {});
      }

      if (connection === 'close') {
        clearTimeout(watchdog);
        // Connection is already closed — just detach listeners, no need to call end()
        if (sock) { try { sock.ev.removeAllListeners(); } catch {} sock = null; }
        connectionStatus = 'disconnected';

        const code = lastDisconnect?.error?.output?.statusCode;
        const errMsg = lastDisconnect?.error?.message || '';
        logger.warn(`[WhatsApp] Disconnected — code: ${code} | ${errMsg}`);

        // How long since last successful connection?
        const msSinceConnect = _lastConnectedAt ? Date.now() - _lastConnectedAt : Infinity;
        const freshSession = msSinceConnect < 120000; // within 2 min = just scanned QR

        if (code === DisconnectReason.connectionReplaced) {
          // 440: another client grabbed the same session slot
          _consecutive440s++;
          logger.warn(`[WhatsApp] 440 × ${_consecutive440s}`);
          if (_consecutive440s >= 3) {
            logger.warn('[WhatsApp] 3× 440 — clearing session for fresh QR');
            _consecutive440s = 0;
            _scheduleReinit(2000, true);
          } else {
            _scheduleReinit(6000, false);
          }

        } else if (code === DisconnectReason.loggedOut) {
          // 401 — device removed from phone; need new QR regardless
          logger.warn('[WhatsApp] Logged out (401) — clearing session for fresh QR');
          _scheduleReinit(3000, true);

        } else if (
          code === DisconnectReason.badSession ||         // 500
          code === DisconnectReason.multideviceMismatch  // 411
        ) {
          if (freshSession) {
            // Prekey bundle conflict on a just-scanned session.
            // Don't clear — just reconnect; Baileys will resolve prekeys automatically.
            _postConnectRetries++;
            logger.warn(`[WhatsApp] ${code} on fresh session (${Math.round(msSinceConnect/1000)}s ago) — reconnecting without clear (attempt ${_postConnectRetries})`);
            if (_postConnectRetries >= 4) {
              logger.warn('[WhatsApp] 4 post-connect failures — clearing session for fresh QR');
              _postConnectRetries = 0;
              _scheduleReinit(3000, true);
            } else {
              _scheduleReinit(4000, false);
            }
          } else {
            logger.warn(`[WhatsApp] Irrecoverable (${code}) on old session — clearing for fresh QR`);
            _scheduleReinit(3000, true);
          }

        } else {
          // Generic / transient disconnect — reconnect with same session
          logger.info(`[WhatsApp] Reconnecting in 5s (code: ${code})…`);
          _scheduleReinit(5000, false);
        }
      }
    });

  } catch (err) {
    connectionStatus = 'unavailable';
    lastError = err.message;
    logger.error(`[WhatsApp] Init failed: ${err.message}`);
    logger.error(err.stack || '');
  } finally {
    isInitializing = false;
  }
};

// ── Core send ─────────────────────────────────────────────────────────────────
const sendMessage = async (phone, message) => {
  if (!phone || !message) return false;

  const digits = phone.replace(/\D/g, '');
  const withCC = digits.length === 10 ? `91${digits}` : digits;

  if (sock && connectionStatus === 'connected') {
    try {
      await sock.sendMessage(`${withCC}@s.whatsapp.net`, { text: message });
      logger.info(`[WhatsApp] ✅ Sent to +${withCC}`);
      return true;
    } catch (err) {
      logger.error(`[WhatsApp] ❌ Failed to +${withCC}: ${err.message}`);
      return false;
    }
  }

  logger.info(`[WhatsApp STUB] → +${withCC}\n${message.substring(0, 120)}`);
  return false;
};

// ── Group join via invite link ─────────────────────────────────────────────────
const joinGroupViaLink = async (inviteLink) => {
  const code = inviteLink.replace(/^https?:\/\/chat\.whatsapp\.com\//i, '').trim();
  if (!code) throw new Error('Invalid invite link');

  if (connectionStatus !== 'connected') {
    logger.info(`[WhatsApp] joinGroup: waiting for connection (current: ${connectionStatus})`);
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('WhatsApp not connected — scan QR at /api/whatsapp/setup and retry')), 30000);
      const check = setInterval(() => {
        if (connectionStatus === 'connected') { clearInterval(check); clearTimeout(deadline); resolve(); }
      }, 500);
    });
  }

  if (!sock) throw new Error('WhatsApp socket unavailable');
  const groupJid = await sock.groupAcceptInvite(code);
  logger.info(`[WhatsApp] ✅ Joined group ${groupJid} via invite`);
  return groupJid;
};

// ── Group messaging ───────────────────────────────────────────────────────────
const sendGroupMessage = async (groupJid, message) => {
  if (!groupJid || !message) return false;
  if (sock && connectionStatus === 'connected') {
    try {
      await sock.sendMessage(groupJid, { text: message });
      logger.info(`[WhatsApp] ✅ Sent to group ${groupJid}`);
      return true;
    } catch (err) {
      logger.error(`[WhatsApp] ❌ Failed to group ${groupJid}: ${err.message}`);
      return false;
    }
  }
  logger.info(`[WhatsApp STUB] → group:${groupJid}\n${message.substring(0, 120)}`);
  return false;
};

const getJoinedGroups = async () => {
  if (!sock || connectionStatus !== 'connected') return [];
  try {
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups).map(g => ({
      jid: g.id,
      name: g.subject,
      participants: g.participants?.length || 0,
    }));
  } catch (err) {
    logger.error(`[WhatsApp] Failed to fetch groups: ${err.message}`);
    return [];
  }
};

// ── Message builders ──────────────────────────────────────────────────────────
const fmt = (n) => (n || 0).toLocaleString('en-IN');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No due date';
const PRIORITY_EMOJI = { critical: '🔴', urgent: '🟠', high: '🟡', medium: '🔵', low: '⚪' };
const APP_URL = process.env.APP_URL || 'https://backero-worktaskflow.netlify.app';

const sendTaskAssigned = async (phone, { title, assignedByName, priority, department, dueDate, description, taskId }) => {
  const link = taskId ? `${APP_URL}/tasks/${taskId}` : APP_URL;
  return sendMessage(phone,
    `🎯 *New Task Assigned — Backero*\n\n` +
    `📌 *Task:* ${title}\n` +
    `👤 *Assigned by:* ${assignedByName}\n` +
    `${PRIORITY_EMOJI[priority] || '🔵'} *Priority:* ${(priority || 'medium').toUpperCase()}\n` +
    `🏢 *Department:* ${department || '—'}\n` +
    `📅 *Due Date:* ${fmtDate(dueDate)}\n` +
    (description ? `📝 *Note:* ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}\n` : '') +
    `\n🔗 *View Task:* ${link}\n\n_Reply with your update when work starts_`
  );
};

const sendTaskOverdueEmployee = async (phone, { title, assignedByName, dueDate, overdueCount, taskId }) => {
  const link = taskId ? `${APP_URL}/tasks/${taskId}` : APP_URL;
  return sendMessage(phone,
    `⚠️ *TASK OVERDUE — Backero Alert*\n\n` +
    `📌 *Task:* ${title}\n` +
    `📅 *Was Due:* ${fmtDate(dueDate)}\n` +
    `👤 *Assigned by:* ${assignedByName || '—'}\n` +
    (overdueCount > 1 ? `🔁 *Reminder #${overdueCount}*\n` : '') +
    `\n⚡ Your task is overdue! Please update your progress immediately.\n` +
    `\n🔗 *Take Action:* ${link}\n\n_Login to Backero to take action_`
  );
};

const sendTaskOverdueManager = async (phone, { title, employeeName, department, dueDate, priority, taskId }) => {
  const link = taskId ? `${APP_URL}/tasks/${taskId}` : `${APP_URL}/tasks/my`;
  return sendMessage(phone,
    `🚨 *TEAM TASK OVERDUE — Backero*\n\n` +
    `📌 *Task:* ${title}\n` +
    `👤 *Assigned to:* ${employeeName}\n` +
    `🏢 *Department:* ${department || '—'}\n` +
    `${PRIORITY_EMOJI[priority] || '🔵'} *Priority:* ${(priority || 'medium').toUpperCase()}\n` +
    `📅 *Was Due:* ${fmtDate(dueDate)}\n` +
    `\n⚡ Action required: Please follow up with ${employeeName} immediately.\n` +
    `\n🔗 *Review:* ${link}\n\n_Login to Backero → Team Tasks to review_`
  );
};

const sendTaskOverdueGroup = async (groupJid, { title, employeeName, department, dueDate, priority, overdueCount, taskId }) => {
  const link = taskId ? `${APP_URL}/tasks/${taskId}` : `${APP_URL}/tasks/my`;
  return sendGroupMessage(groupJid,
    `🚨 *OVERDUE TASK ALERT — ${department || 'Department'}*\n\n` +
    `📌 *Task:* ${title}\n` +
    `👤 *Assigned to:* ${employeeName}\n` +
    `${PRIORITY_EMOJI[priority] || '🔵'} *Priority:* ${(priority || 'medium').toUpperCase()}\n` +
    `📅 *Was Due:* ${fmtDate(dueDate)}\n` +
    (overdueCount > 1 ? `🔁 *Reminder #${overdueCount}*\n` : '') +
    `\n⚡ This task is overdue. Team lead please follow up immediately.\n` +
    `\n🔗 ${link}\n\n_Backero Task Management_`
  );
};

const sendNewLeadAlert = async (groupJid, { name, phone, company, city, state, source, priority, productInterest, estimatedValue, createdByName }) => {
  const PRIORITY_LABEL = { critical: '🔴 CRITICAL', high: '🟡 HIGH', medium: '🔵 MEDIUM', low: '⚪ LOW' };
  return sendGroupMessage(groupJid,
    `🆕 *New Lead — Backero CRM*\n\n` +
    `👤 *Name:* ${name}\n` +
    `📱 *Phone:* ${phone}\n` +
    (company ? `🏢 *Company:* ${company}\n` : '') +
    (city || state ? `📍 *Location:* ${[city, state].filter(Boolean).join(', ')}\n` : '') +
    (source ? `🔗 *Source:* ${source}\n` : '') +
    (priority ? `⭐ *Priority:* ${PRIORITY_LABEL[priority] || priority}\n` : '') +
    (productInterest?.length ? `📦 *Interest:* ${productInterest.join(', ')}\n` : '') +
    (estimatedValue ? `💰 *Est. Value:* ₹${Number(estimatedValue).toLocaleString('en-IN')}\n` : '') +
    `\n👤 *Added by:* ${createdByName}\n` +
    `\n🔗 ${APP_URL}/crm/pipeline\n\n_Backero CRM_`
  );
};

const sendDailyReport = async (phone, {
  orgName, date,
  tasksCompleted, tasksOverdue, tasksPendingApproval, tasksInProgress, totalTasks,
  newLeadsToday, leadsWonToday, activeLeads,
  incomeToday, expenseToday,
  lowStockCount, activeProductionOrders,
  topPerformerName, topPerformerCount,
  departmentStats = [],
  marketplaceToday = null,
  platformListings = [],
}) => {
  const netToday = (incomeToday || 0) - (expenseToday || 0);
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

  let deptSection = '';
  if (departmentStats?.length > 0) {
    const lines = departmentStats.map((d) => {
      const parts = [];
      if (d.completed)  parts.push(`✅${d.completed}`);
      if (d.inProgress) parts.push(`🔄${d.inProgress}`);
      if (d.overdue)    parts.push(`⏰${d.overdue}`);
      if (d.pending)    parts.push(`🕐${d.pending}`);
      const sub = d.subtaskCount ? ` · ${d.subtaskCount} sub` : '';
      const due = d.nearestDue   ? ` · due ${fmtD(d.nearestDue)}` : '';
      return `▸ *${d.department}*  ${d.total} tasks  ${parts.join(' ')}${sub}${due}`;
    });
    deptSection = `━━━━━━━━━━━━━━━━━━━━\n📂 *DEPARTMENT BREAKDOWN*\n${lines.join('\n')}\n\n`;
  }

  let mktSection = '';
  if (marketplaceToday) {
    const net = (marketplaceToday.adRevenue || 0) - (marketplaceToday.adSpend || 0);
    mktSection =
      `━━━━━━━━━━━━━━━━━━━━\n🛒 *MARKETPLACE TODAY*\n` +
      `💰 Total Sales: *₹${fmt(marketplaceToday.totalSales)}*\n` +
      `📢 Ad Spend: *₹${fmt(marketplaceToday.adSpend)}*  |  Ad Revenue: *₹${fmt(marketplaceToday.adRevenue)}*\n` +
      `${net >= 0 ? '📈' : '📉'} Ad Net: *₹${fmt(Math.abs(net))}* ${net < 0 ? '(loss)' : '(profit)'}\n` +
      `📊 CTR: *${(marketplaceToday.ctr || 0).toFixed(2)}%*  |  CVR: *${(marketplaceToday.cvr || 0).toFixed(2)}%*\n` +
      `🔄 Returns: *${fmt(marketplaceToday.returns)}*\n` +
      (platformListings.length > 0 ? `📦 *Listings per Platform:*\n${platformListings.map((p) => `  • ${p._id}: *${p.count}* listings`).join('\n')}\n` : '') +
      '\n';
  } else if (platformListings.length > 0) {
    mktSection =
      `━━━━━━━━━━━━━━━━━━━━\n🛒 *MARKETPLACE*\n` +
      `📦 *Listings per Platform:*\n${platformListings.map((p) => `  • ${p._id}: *${p.count}* listings`).join('\n')}\n\n`;
  }

  return sendMessage(phone,
    `📊 *Daily Operations Report*\n🏢 *${orgName}*\n📅 *${date}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n📋 *TASKS OVERVIEW*\n` +
    `✅ Completed Today: *${tasksCompleted}*\n🔄 In Progress: *${tasksInProgress}*\n` +
    `⏰ Overdue: *${tasksOverdue}*\n🔍 Pending Approvals: *${tasksPendingApproval}*\n📝 Total Active: *${totalTasks}*\n\n` +
    deptSection + mktSection +
    `━━━━━━━━━━━━━━━━━━━━\n👥 *CRM / LEADS*\n` +
    `🆕 New Leads Today: *${newLeadsToday}*\n🏆 Won Today: *${leadsWonToday}*\n📊 Total Active Leads: *${activeLeads}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n💰 *FINANCE (Today)*\n` +
    `💚 Income: *₹${fmt(incomeToday)}*\n🔴 Expense: *₹${fmt(expenseToday)}*\n` +
    `${netToday >= 0 ? '📈' : '📉'} Net: *₹${fmt(Math.abs(netToday))}* ${netToday < 0 ? '(loss)' : '(profit)'}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n📦 *INVENTORY & PRODUCTION*\n` +
    `⚠️ Low Stock Alerts: *${lowStockCount}*\n🏭 Active Production Orders: *${activeProductionOrders}*\n\n` +
    (topPerformerName ? `━━━━━━━━━━━━━━━━━━━━\n🏆 *TOP PERFORMER TODAY*\n👑 ${topPerformerName} — *${topPerformerCount} tasks completed*\n\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━\n_Backero Enterprise Platform_\n_Automated Daily Report · 9 PM IST_\n_📄 Full PDF report attached_`
  );
};

const sendDailyReportWithPDF = async (phone, pdfBuffer, fileName) => {
  if (!pdfBuffer || !phone) return false;
  const digits = phone.replace(/\D/g, '');
  const withCC = digits.length === 10 ? `91${digits}` : digits;
  if (sock && connectionStatus === 'connected') {
    try {
      await sock.sendMessage(`${withCC}@s.whatsapp.net`, {
        document: pdfBuffer, mimetype: 'application/pdf',
        fileName: fileName || 'daily-report.pdf',
        caption: '📊 Daily Operations Report — Full PDF',
      });
      logger.info(`[WhatsApp] ✅ PDF sent to +${withCC}`);
      return true;
    } catch (err) {
      logger.error(`[WhatsApp] ❌ PDF send failed to +${withCC}: ${err.message}`);
      return false;
    }
  }
  logger.info(`[WhatsApp STUB] PDF → +${withCC} (${fileName})`);
  return false;
};

// ── Status ────────────────────────────────────────────────────────────────────
const getStatus    = () => connectionStatus;
const getQRCode    = () => qrCode;
const isConnected  = () => connectionStatus === 'connected';
const getDebugInfo = () => ({
  status: connectionStatus,
  connected: connectionStatus === 'connected',
  hasQR: !!qrCode,
  isInitializing,
  consecutive440s: _consecutive440s,
  postConnectRetries: _postConnectRetries,
  lastConnectedSecsAgo: _lastConnectedAt ? Math.round((Date.now() - _lastConnectedAt) / 1000) : null,
  lastError,
  sockAlive: !!sock,
});

const reinitWhatsApp = async () => {
  isInitializing = false;
  _closeSock();
  await clearMongoSession().catch(() => {});
  logger.info('[WhatsApp] Session cleared via reinit — fresh QR incoming');
  qrCode = null;
  connectionStatus = 'disconnected';
  _lastConnectedAt = 0;
  _postConnectRetries = 0;
  await initWhatsApp(io_ref);
};

const sendInProgressLeadUpdate = async (phone, { name, lastUpdate }) => {
  const msg =
    `Hello ${name} 👋\n\n` +
    `Your order is currently *In Progress* with us.\n\n` +
    (lastUpdate ? `📋 *Latest Update:*\n${lastUpdate}\n\n` : '') +
    `We're working on it and will keep you posted.\n` +
    `For any queries, feel free to reach out anytime.\n\n` +
    `— Backero Team`;
  return sendMessage(phone, msg);
};

module.exports = {
  initWhatsApp,
  reinitWhatsApp,
  getDebugInfo,
  sendMessage,
  joinGroupViaLink,
  sendGroupMessage,
  getJoinedGroups,
  sendTaskAssigned,
  sendTaskOverdueEmployee,
  sendTaskOverdueManager,
  sendTaskOverdueGroup,
  sendNewLeadAlert,
  sendInProgressLeadUpdate,
  sendDailyReport,
  sendDailyReportWithPDF,
  getStatus,
  getQRCode,
  isConnected,
};
