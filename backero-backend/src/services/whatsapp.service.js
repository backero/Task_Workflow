const logger = require('../utils/logger');
const { useMongoAuthState, clearMongoSession } = require('./whatsappMongoAuth');

let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'unavailable'
let io_ref = null;

// ── Init ─────────────────────────────────────────────────────────────────────
const initWhatsApp = async (io) => {
  io_ref = io;
  try {
    // @whiskeysockets/baileys is ESM-only — use dynamic import
    const baileys = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default ?? baileys.makeWASocket;
    const { DisconnectReason, fetchLatestBaileysVersion } = baileys;

    // MongoDB auth persists across Render restarts; file-based /tmp is wiped on each deploy
    const { state, saveCreds } = await useMongoAuthState(baileys);

    const { version } = await fetchLatestBaileysVersion();

    const connect = async () => {
      connectionStatus = 'connecting';

      // Safety net: if still connecting with no QR after 45s, the stored session
      // is probably silently broken. Clear it and start fresh.
      const connectWatchdog = setTimeout(() => {
        if (connectionStatus === 'connecting') {
          logger.warn('[WhatsApp] Stuck connecting for 45s — clearing session for fresh QR');
          if (sock) { sock.ev.removeAllListeners(); sock = null; }
          (async () => {
            await clearMongoSession().catch(() => {});
            setTimeout(() => initWhatsApp(io_ref), 2000);
          })();
        }
      }, 45000);

      const noop = () => {};
      const silentLogger = { level: 'silent', info: noop, warn: noop, error: noop, debug: noop, trace: noop, fatal: noop, child: () => silentLogger };

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

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          qrCode = qr;
          connectionStatus = 'qr_ready';
          logger.info('WhatsApp QR ready → visit GET /api/whatsapp/qr to scan');
          io_ref?.emit('wa_qr', { qr });
        }

        if (connection === 'close') {
          clearTimeout(connectWatchdog);
          sock = null;
          connectionStatus = 'disconnected';

          const statusCode = lastDisconnect?.error?.output?.statusCode;
          logger.info(`WhatsApp closed (code: ${statusCode})`);

          // 440 connectionReplaced — credentials are still valid; another client (old Render
          // dyno during deploy overlap) grabbed the same session slot. Do NOT clear MongoDB.
          // Jitter (30-50s) ensures two competing dynos don't reconnect simultaneously,
          // which would cause them to keep kicking each other in an infinite 440 loop.
          if (statusCode === DisconnectReason.connectionReplaced) {
            const jitter = Math.floor(Math.random() * 20000); // 0–20s random
            const delay = 30000 + jitter;
            logger.warn(`[WhatsApp] 440 connectionReplaced — waiting ${Math.round(delay/1000)}s (jitter) before reconnect`);
            setTimeout(connect, delay);
            return;
          }

          // These codes mean the stored session is irrecoverable — clear it and get a fresh QR.
          // Reconnecting with the same stale credentials would loop forever without ever showing a QR.
          const IRRECOVERABLE = new Set([
            DisconnectReason.loggedOut,           // 401 — device removed from phone
            DisconnectReason.badSession,          // 500 — corrupt / replaced session
            DisconnectReason.multideviceMismatch, // 411 — device key mismatch
          ]);

          if (IRRECOVERABLE.has(statusCode)) {
            // Must call initWhatsApp() not connect() — connect() closes over the old
            // in-memory state object, so it would still send the stale credentials.
            // initWhatsApp() reloads state fresh from MongoDB after clearing.
            (async () => {
              logger.warn(`WhatsApp irrecoverable disconnect (${statusCode}) — clearing MongoDB session for fresh QR`);
              await clearMongoSession().catch(() => {});
              logger.info('[WhatsApp] Session cleared — reinitialising in 5s for fresh QR');
              setTimeout(() => initWhatsApp(io_ref), 5000);
            })();
          } else {
            logger.info('WhatsApp reconnecting in 5s...');
            setTimeout(connect, 5000);
          }
        } else if (connection === 'open') {
          clearTimeout(connectWatchdog);
          qrCode = null;
          connectionStatus = 'connected';
          logger.info('✅ WhatsApp connected and ready to send messages');
          io_ref?.emit('wa_connected', {});
        }
      });
    };

    await connect();
  } catch (err) {
    connectionStatus = 'unavailable';
    logger.warn(`WhatsApp unavailable: ${err.message}`);
    logger.warn('Run: npm install @whiskeysockets/baileys  to enable WhatsApp sending');
  }
};

// ── Core send ────────────────────────────────────────────────────────────────
const sendMessage = async (phone, message) => {
  if (!phone || !message) return false;

  const digits = phone.replace(/\D/g, '');
  // Add India country code if number is 10 digits
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

  // Fallback: log so you can verify the message content
  logger.info(`[WhatsApp STUB] → +${withCC}\n${message.substring(0, 120)}`);
  return false;
};

// ── Group join via invite link ────────────────────────────────────────────────
const joinGroupViaLink = async (inviteLink) => {
  // Extract invite code first so we can validate before waiting
  const code = inviteLink.replace(/^https?:\/\/chat\.whatsapp\.com\//i, '').trim();
  if (!code) throw new Error('Invalid invite link');

  // Wait up to 30s for a stable connection (handles brief 440 reconnect cycles)
  if (connectionStatus !== 'connected') {
    logger.info(`[WhatsApp] joinGroup: waiting for connection (current: ${connectionStatus})`);
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('WhatsApp not connected — scan QR at /api/whatsapp/setup and retry')), 30000);
      const check = setInterval(() => {
        if (connectionStatus === 'connected') {
          clearInterval(check);
          clearTimeout(deadline);
          resolve();
        }
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

// ── Formatted message builders ────────────────────────────────────────────────

const fmt = (n) => (n || 0).toLocaleString('en-IN');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No due date';
const PRIORITY_EMOJI = { critical: '🔴', urgent: '🟠', high: '🟡', medium: '🔵', low: '⚪' };

// 1. Task Assigned → send to employee
const APP_URL = process.env.APP_URL || 'https://backero-worktaskflow.netlify.app';

const sendTaskAssigned = async (phone, { title, assignedByName, priority, department, dueDate, description, taskId }) => {
  const link = taskId ? `${APP_URL}/tasks/${taskId}` : APP_URL;
  const msg =
    `🎯 *New Task Assigned — Backero*\n\n` +
    `📌 *Task:* ${title}\n` +
    `👤 *Assigned by:* ${assignedByName}\n` +
    `${PRIORITY_EMOJI[priority] || '🔵'} *Priority:* ${(priority || 'medium').toUpperCase()}\n` +
    `🏢 *Department:* ${department || '—'}\n` +
    `📅 *Due Date:* ${fmtDate(dueDate)}\n` +
    (description ? `📝 *Note:* ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}\n` : '') +
    `\n🔗 *View Task:* ${link}\n` +
    `\n_Reply with your update when work starts_`;
  return sendMessage(phone, msg);
};

// 2. Task Overdue → employee
const sendTaskOverdueEmployee = async (phone, { title, assignedByName, dueDate, overdueCount, taskId }) => {
  const link = taskId ? `${APP_URL}/tasks/${taskId}` : APP_URL;
  const msg =
    `⚠️ *TASK OVERDUE — Backero Alert*\n\n` +
    `📌 *Task:* ${title}\n` +
    `📅 *Was Due:* ${fmtDate(dueDate)}\n` +
    `👤 *Assigned by:* ${assignedByName || '—'}\n` +
    (overdueCount > 1 ? `🔁 *Reminder #${overdueCount}*\n` : '') +
    `\n⚡ Your task is overdue! Please update your progress immediately or raise a completion request.\n` +
    `\n🔗 *Take Action:* ${link}\n` +
    `\n_Login to Backero to take action_`;
  return sendMessage(phone, msg);
};

// 3. Task Overdue → manager / admin
const sendTaskOverdueManager = async (phone, { title, employeeName, department, dueDate, priority, taskId }) => {
  const link = taskId ? `${APP_URL}/tasks/${taskId}` : `${APP_URL}/tasks/my`;
  const msg =
    `🚨 *TEAM TASK OVERDUE — Backero*\n\n` +
    `📌 *Task:* ${title}\n` +
    `👤 *Assigned to:* ${employeeName}\n` +
    `🏢 *Department:* ${department || '—'}\n` +
    `${PRIORITY_EMOJI[priority] || '🔵'} *Priority:* ${(priority || 'medium').toUpperCase()}\n` +
    `📅 *Was Due:* ${fmtDate(dueDate)}\n` +
    `\n⚡ Action required: Please follow up with ${employeeName} immediately.\n` +
    `\n🔗 *Review:* ${link}\n` +
    `\n_Login to Backero → Team Tasks to review_`;
  return sendMessage(phone, msg);
};

const sendTaskOverdueGroup = async (groupJid, { title, employeeName, department, dueDate, priority, overdueCount, taskId }) => {
  const link = taskId ? `${APP_URL}/tasks/${taskId}` : `${APP_URL}/tasks/my`;
  const msg =
    `🚨 *OVERDUE TASK ALERT — ${department || 'Department'}*\n\n` +
    `📌 *Task:* ${title}\n` +
    `👤 *Assigned to:* ${employeeName}\n` +
    `${PRIORITY_EMOJI[priority] || '🔵'} *Priority:* ${(priority || 'medium').toUpperCase()}\n` +
    `📅 *Was Due:* ${fmtDate(dueDate)}\n` +
    (overdueCount > 1 ? `🔁 *Reminder #${overdueCount}*\n` : '') +
    `\n⚡ This task is overdue. Team lead please follow up immediately.\n` +
    `\n🔗 ${link}\n` +
    `\n_Backero Task Management_`;
  return sendGroupMessage(groupJid, msg);
};

// 4. New Lead → CRM group
const sendNewLeadAlert = async (groupJid, { name, phone, company, city, state, source, priority, productInterest, estimatedValue, createdByName }) => {
  const PRIORITY_LABEL = { critical: '🔴 CRITICAL', high: '🟡 HIGH', medium: '🔵 MEDIUM', low: '⚪ LOW' };
  const msg =
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
    `\n🔗 ${APP_URL}/crm/pipeline\n` +
    `\n_Backero CRM_`;
  return sendGroupMessage(groupJid, msg);
};

// 5. Daily 9 PM Report → admins / founders
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

  // Department breakdown lines (compact: one line per dept)
  let deptSection = '';
  if (departmentStats && departmentStats.length > 0) {
    const lines = departmentStats.map((d) => {
      const parts = [];
      if (d.completed)  parts.push(`✅${d.completed}`);
      if (d.inProgress) parts.push(`🔄${d.inProgress}`);
      if (d.overdue)    parts.push(`⏰${d.overdue}`);
      if (d.pending)    parts.push(`🕐${d.pending}`);
      const sub  = d.subtaskCount ? ` · ${d.subtaskCount} sub` : '';
      const due  = d.nearestDue   ? ` · due ${fmtD(d.nearestDue)}` : '';
      return `▸ *${d.department}*  ${d.total} tasks  ${parts.join(' ')}${sub}${due}`;
    });
    deptSection =
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📂 *DEPARTMENT BREAKDOWN*\n` +
      lines.join('\n') + '\n\n';
  }

  // Marketplace section
  let mktSection = '';
  if (marketplaceToday) {
    const net = (marketplaceToday.adRevenue || 0) - (marketplaceToday.adSpend || 0);
    mktSection =
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🛒 *MARKETPLACE TODAY*\n` +
      `💰 Total Sales: *₹${fmt(marketplaceToday.totalSales)}*\n` +
      `📢 Ad Spend: *₹${fmt(marketplaceToday.adSpend)}*  |  Ad Revenue: *₹${fmt(marketplaceToday.adRevenue)}*\n` +
      `${net >= 0 ? '📈' : '📉'} Ad Net: *₹${fmt(Math.abs(net))}* ${net < 0 ? '(loss)' : '(profit)'}\n` +
      `📊 CTR: *${(marketplaceToday.ctr || 0).toFixed(2)}%*  |  CVR: *${(marketplaceToday.cvr || 0).toFixed(2)}%*\n` +
      `🔄 Returns: *${fmt(marketplaceToday.returns)}*\n`;

    if (platformListings.length > 0) {
      const platLines = platformListings.map((p) => `  • ${p._id}: *${p.count}* listings`).join('\n');
      mktSection += `📦 *Listings per Platform:*\n${platLines}\n`;
    }
    mktSection += '\n';
  } else if (platformListings.length > 0) {
    const platLines = platformListings.map((p) => `  • ${p._id}: *${p.count}* listings`).join('\n');
    mktSection =
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🛒 *MARKETPLACE*\n` +
      `📦 *Listings per Platform:*\n${platLines}\n\n`;
  }

  const msg =
    `📊 *Daily Operations Report*\n` +
    `🏢 *${orgName}*\n` +
    `📅 *${date}*\n\n` +

    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *TASKS OVERVIEW*\n` +
    `✅ Completed Today: *${tasksCompleted}*\n` +
    `🔄 In Progress: *${tasksInProgress}*\n` +
    `⏰ Overdue: *${tasksOverdue}*\n` +
    `🔍 Pending Approvals: *${tasksPendingApproval}*\n` +
    `📝 Total Active: *${totalTasks}*\n\n` +

    deptSection +
    mktSection +

    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 *CRM / LEADS*\n` +
    `🆕 New Leads Today: *${newLeadsToday}*\n` +
    `🏆 Won Today: *${leadsWonToday}*\n` +
    `📊 Total Active Leads: *${activeLeads}*\n\n` +

    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *FINANCE (Today)*\n` +
    `💚 Income: *₹${fmt(incomeToday)}*\n` +
    `🔴 Expense: *₹${fmt(expenseToday)}*\n` +
    `${netToday >= 0 ? '📈' : '📉'} Net: *₹${fmt(Math.abs(netToday))}* ${netToday < 0 ? '(loss)' : '(profit)'}\n\n` +

    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 *INVENTORY & PRODUCTION*\n` +
    `⚠️ Low Stock Alerts: *${lowStockCount}*\n` +
    `🏭 Active Production Orders: *${activeProductionOrders}*\n\n` +

    (topPerformerName
      ? `━━━━━━━━━━━━━━━━━━━━\n🏆 *TOP PERFORMER TODAY*\n👑 ${topPerformerName} — *${topPerformerCount} tasks completed*\n\n`
      : '') +

    `━━━━━━━━━━━━━━━━━━━━\n` +
    `_Backero Enterprise Platform_\n` +
    `_Automated Daily Report · 9 PM IST_\n` +
    `_📄 Full PDF report attached_`;
  return sendMessage(phone, msg);
};

// 5. Send PDF report as WhatsApp document
const sendDailyReportWithPDF = async (phone, pdfBuffer, fileName) => {
  if (!pdfBuffer || !phone) return false;
  const digits = phone.replace(/\D/g, '');
  const withCC = digits.length === 10 ? `91${digits}` : digits;

  if (sock && connectionStatus === 'connected') {
    try {
      await sock.sendMessage(`${withCC}@s.whatsapp.net`, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
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

// ── Status helpers ────────────────────────────────────────────────────────────
const getStatus = () => connectionStatus;
const getQRCode = () => qrCode;
const isConnected = () => connectionStatus === 'connected';

const reinitWhatsApp = async () => {
  try {
    if (sock) {
      sock.ev.removeAllListeners();
      await sock.logout().catch(() => {});
      sock = null;
    }
  } catch {}

  // Clear MongoDB session so Baileys starts fresh and generates a new QR
  await clearMongoSession().catch(() => {});
  logger.info('[WhatsApp] MongoDB session cleared — fresh QR will be generated');

  qrCode = null;
  connectionStatus = 'disconnected';
  await initWhatsApp(io_ref);
};

module.exports = {
  initWhatsApp,
  reinitWhatsApp,
  sendMessage,
  joinGroupViaLink,
  sendGroupMessage,
  getJoinedGroups,
  sendTaskAssigned,
  sendTaskOverdueEmployee,
  sendTaskOverdueManager,
  sendTaskOverdueGroup,
  sendNewLeadAlert,
  sendDailyReport,
  sendDailyReportWithPDF,
  getStatus,
  getQRCode,
  isConnected,
};
