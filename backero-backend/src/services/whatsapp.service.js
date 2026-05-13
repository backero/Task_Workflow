const logger = require('../utils/logger');

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
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

    const sessionPath = process.env.WA_SESSION_PATH || './wa_session';
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const connect = async () => {
      connectionStatus = 'connecting';

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
          sock = null;
          connectionStatus = 'disconnected';

          let shouldReconnect = true;
          try {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
              logger.warn('WhatsApp logged out — re-scan QR at GET /api/whatsapp/qr');
              shouldReconnect = false;
            }
            logger.info(`WhatsApp closed (code: ${statusCode})`);
          } catch { /* ignore */ }

          if (shouldReconnect) {
            logger.info('WhatsApp reconnecting in 5 s...');
            setTimeout(connect, 5000);
          }
        } else if (connection === 'open') {
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

// ── Formatted message builders ────────────────────────────────────────────────

const fmt = (n) => (n || 0).toLocaleString('en-IN');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No due date';
const PRIORITY_EMOJI = { critical: '🔴', urgent: '🟠', high: '🟡', medium: '🔵', low: '⚪' };

// 1. Task Assigned → send to employee
const sendTaskAssigned = async (phone, { title, assignedByName, priority, department, dueDate, description }) => {
  const msg =
    `🎯 *New Task Assigned — Backero*\n\n` +
    `📌 *Task:* ${title}\n` +
    `👤 *Assigned by:* ${assignedByName}\n` +
    `${PRIORITY_EMOJI[priority] || '🔵'} *Priority:* ${(priority || 'medium').toUpperCase()}\n` +
    `🏢 *Department:* ${department || '—'}\n` +
    `📅 *Due Date:* ${fmtDate(dueDate)}\n` +
    (description ? `📝 *Note:* ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}\n` : '') +
    `\nLogin to Backero to view details and update your progress.\n` +
    `\n_Reply with your update when work starts_`;
  return sendMessage(phone, msg);
};

// 2. Task Overdue → employee
const sendTaskOverdueEmployee = async (phone, { title, assignedByName, dueDate, overdueCount }) => {
  const msg =
    `⚠️ *TASK OVERDUE — Backero Alert*\n\n` +
    `📌 *Task:* ${title}\n` +
    `📅 *Was Due:* ${fmtDate(dueDate)}\n` +
    `👤 *Assigned by:* ${assignedByName || '—'}\n` +
    (overdueCount > 1 ? `🔁 *Reminder #${overdueCount}*\n` : '') +
    `\n⚡ Your task is overdue! Please update your progress immediately or raise a completion request.\n` +
    `\n_Login to Backero to take action_`;
  return sendMessage(phone, msg);
};

// 3. Task Overdue → manager / admin
const sendTaskOverdueManager = async (phone, { title, employeeName, department, dueDate, priority }) => {
  const msg =
    `🚨 *TEAM TASK OVERDUE — Backero*\n\n` +
    `📌 *Task:* ${title}\n` +
    `👤 *Assigned to:* ${employeeName}\n` +
    `🏢 *Department:* ${department || '—'}\n` +
    `${PRIORITY_EMOJI[priority] || '🔵'} *Priority:* ${(priority || 'medium').toUpperCase()}\n` +
    `📅 *Was Due:* ${fmtDate(dueDate)}\n` +
    `\n⚡ Action required: Please follow up with ${employeeName} immediately.\n` +
    `\n_Login to Backero → Team Tasks to review_`;
  return sendMessage(phone, msg);
};

// 4. Daily 9 PM Report → admins / founders
const sendDailyReport = async (phone, {
  orgName, date,
  tasksCompleted, tasksOverdue, tasksPendingApproval, tasksInProgress, totalTasks,
  newLeadsToday, leadsWonToday, activeLeads,
  incomeToday, expenseToday,
  lowStockCount, activeProductionOrders,
  topPerformerName, topPerformerCount,
}) => {
  const netToday = (incomeToday || 0) - (expenseToday || 0);
  const msg =
    `📊 *Daily Operations Report*\n` +
    `🏢 *${orgName}*\n` +
    `📅 *${date}*\n\n` +

    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *TASKS*\n` +
    `✅ Completed Today: *${tasksCompleted}*\n` +
    `🔄 In Progress: *${tasksInProgress}*\n` +
    `⏰ Overdue: *${tasksOverdue}*\n` +
    `🔍 Pending Approvals: *${tasksPendingApproval}*\n` +
    `📝 Total Active: *${totalTasks}*\n\n` +

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
    `_Automated Daily Report · 9 PM IST_`;
  return sendMessage(phone, msg);
};

// ── Status helpers ────────────────────────────────────────────────────────────
const getStatus = () => connectionStatus;
const getQRCode = () => qrCode;
const isConnected = () => connectionStatus === 'connected';

module.exports = {
  initWhatsApp,
  sendMessage,
  sendTaskAssigned,
  sendTaskOverdueEmployee,
  sendTaskOverdueManager,
  sendDailyReport,
  getStatus,
  getQRCode,
  isConnected,
};
