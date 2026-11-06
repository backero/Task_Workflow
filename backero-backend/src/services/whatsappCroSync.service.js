// Independent WhatsApp "Linked Device" session dedicated to backing up the
// CRO's real business number (+91 89037 90400) into WaChatMessage — separate
// Baileys connection from whatsapp.service.js's notification bot, so neither
// session interferes with the other. Same proven connection/reconnect logic
// as whatsapp.service.js, adapted to mirror chats instead of sending alerts.
const logger = require('../utils/logger');
const { useMongoAuthState, clearMongoSession } = require('./whatsappMongoAuth');
const WaChatMessage = require('../models/WaChatMessage');
const Lead = require('../models/Lead');
const ProductionQuery = require('../models/ProductionQuery');
const WaChatSummary = require('../models/WaChatSummary');
const { summarizeWhatsAppChat } = require('../utils/groq');

const SESSION_ID = 'cro';
const CRO_BUSINESS_NUMBER = (process.env.CRO_WHATSAPP_NUMBER || '918903790400').replace(/\D/g, '');

let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected';
let io_ref = null;
let isInitializing = false;
let lastError = null;
let _consecutive440s = 0;
let _lastConnectedAt = 0;
let _postConnectRetries = 0;
let _consecutiveGenericFails = 0;

const _closeSock = () => {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch {}
  try { sock.end(undefined); } catch {}
  sock = null;
};

const _scheduleReinit = (delayMs = 3000, clearSession = false) => {
  isInitializing = false;
  if (clearSession) {
    setTimeout(async () => {
      await clearMongoSession(SESSION_ID).catch(() => {});
      setTimeout(() => initWhatsAppCroSync(io_ref), 500);
    }, 200);
  } else {
    setTimeout(() => initWhatsAppCroSync(io_ref), delayMs);
  }
};

// ── Inbound message → WaChatMessage ────────────────────────────────────────────
const extractText = (message) => {
  if (!message) return '[Unsupported message type]';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage) return `[Image]${message.imageMessage.caption ? `: ${message.imageMessage.caption}` : ''}`;
  if (message.videoMessage) return `[Video]${message.videoMessage.caption ? `: ${message.videoMessage.caption}` : ''}`;
  if (message.documentMessage) return `[Document: ${message.documentMessage.fileName || 'file'}]`;
  if (message.audioMessage) return message.audioMessage.ptt ? '[Voice message]' : '[Audio]';
  if (message.stickerMessage) return '[Sticker]';
  if (message.locationMessage) return '[Location shared]';
  return '[Unsupported message type]';
};

async function persistMessage(msg) {
  if (!msg.message) return; // reaction/protocol-only entries carry no content
  const remoteJid = msg.key?.remoteJid;
  if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

  const contact = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  if (!contact) return;

  const orgId = process.env.WA_CHATS_ORG_ID;
  if (!orgId) {
    logger.warn('[WA CRO Sync] WA_CHATS_ORG_ID not set — dropping message');
    return;
  }

  const waMessageId = 'baileys-' + msg.key.id;
  const direction = msg.key.fromMe ? 'out' : 'in';
  const body = extractText(msg.message);
  const sentAt = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();
  const isMedia = /^\[(Image|Video|Document|Voice message|Audio|Sticker)/.test(body);

  try {
    await WaChatMessage.updateOne(
      { organizationId: orgId, waMessageId },
      {
        $setOnInsert: {
          organizationId: orgId,
          waMessageId,
          business: CRO_BUSINESS_NUMBER,
          contact,
          direction,
          type: isMedia ? 'media' : 'text',
          body,
          sentAt,
          source: 'live',
        },
      },
      { upsert: true }
    );
    linkToProductionQA(orgId, contact).catch((err) => logger.error(`[WA CRO Sync] QA link failed: ${err.message}`));
  } catch (err) {
    logger.error(`[WA CRO Sync] Failed to persist message ${msg.key.id}: ${err.message}`);
  }
}

async function linkToProductionQA(orgId, contactNumber) {
  try {
    let lead = await Lead.findOne({ organizationId: orgId, $or: [{ phone: contactNumber }, { whatsapp: contactNumber }] });

    if (!lead) {
      lead = await Lead.create({
        organizationId: orgId,
        name: `Customer ${contactNumber}`,
        phone: contactNumber,
        whatsapp: contactNumber,
        source: 'WhatsApp CRO',
        status: 'new',
      });
      logger.info(`[WA CRO Sync] Created Lead ${lead._id} for contact ${contactNumber}`);
    }

    const messages = await WaChatMessage.find({
      organizationId: orgId,
      business: CRO_BUSINESS_NUMBER,
      contact: contactNumber,
    }).sort({ sentAt: 1 }).lean();

    if (!messages.length) return;

    const chatText = messages
      .map((m) => {
        const sender = m.direction === 'out' ? 'Backero' : 'Customer';
        const time = new Date(m.sentAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `[${time}] ${sender}: ${m.body}`;
      })
      .join('\n');

    let prodQuery = await ProductionQuery.findOne({
      organizationId: orgId,
      leadId: lead._id,
      askedVia: 'WhatsApp',
      deleted: false,
    }).sort({ createdAt: -1 });

    const summary = await summarizeWhatsAppChat(chatText);

    if (!prodQuery) {
      const lastInMsg = messages.filter((m) => m.direction === 'in').pop();
      prodQuery = await ProductionQuery.create({
        organizationId: orgId,
        leadId: lead._id,
        leadName: lead.name,
        raisedBy: lead.assignedTo || lead.inCharge,
        title: `Q&A: ${lead.name} - CRO WhatsApp`,
        description: lastInMsg?.body || 'CRO chat conversation',
        askedVia: 'WhatsApp',
        status: 'pending',
        contactName: lead.name,
        contactEmail: lead.email,
      });
      logger.info(`[WA CRO Sync] Created ProductionQuery ${prodQuery._id} for lead ${lead._id}`);
    } else {
      await ProductionQuery.updateOne({ _id: prodQuery._id }, { editedAt: new Date() });
    }

    await WaChatSummary.updateOne(
      { organizationId: orgId, leadId: lead._id },
      {
        $set: {
          organizationId: orgId,
          leadId: lead._id,
          text: summary,
          messageCount: messages.length,
          lastMessageAt: messages[messages.length - 1].sentAt,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    logger.error(`[WA CRO Sync] linkToProductionQA error: ${err.message}`);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
const initWhatsAppCroSync = async (io) => {
  if (isInitializing) {
    logger.warn('[WA CRO Sync] Init already in progress — ignoring duplicate call');
    return;
  }
  isInitializing = true;
  io_ref = io || io_ref;

  _closeSock();
  connectionStatus = 'connecting';

  try {
    const baileys = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default ?? baileys.makeWASocket;
    const { DisconnectReason, fetchLatestBaileysVersion } = baileys;

    const { state, saveCreds } = await useMongoAuthState(baileys, SESSION_ID);

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
    logger.info(`[WA CRO Sync] Starting — version: ${version} | storedSession: ${hasCreds}`);

    const watchdog = setTimeout(async () => {
      if (connectionStatus === 'connecting') {
        logger.warn('[WA CRO Sync] Watchdog: stuck connecting 60s — clearing session for fresh QR');
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
      browser: ['Backero CRO Sync', 'Chrome', '1.0.0'],
      generateHighQualityLinkPreview: false,
      getMessage: async () => undefined,
      logger: silentLogger,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages || []) {
        await persistMessage(msg).catch((err) => logger.error(`[WA CRO Sync] ${err.message}`));
      }
    });

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        qrCode = qr;
        connectionStatus = 'qr_ready';
        logger.info('[WA CRO Sync] QR ready — open /api/whatsapp/cro/setup to scan');
        io_ref?.emit('wa_cro_qr', { qr });
      }

      if (connection === 'open') {
        clearTimeout(watchdog);
        qrCode = null;
        connectionStatus = 'connected';
        _consecutive440s = 0;
        _consecutiveGenericFails = 0;
        _lastConnectedAt = Date.now();
        _postConnectRetries = 0;
        logger.info('[WA CRO Sync] ✅ Connected and ready');
        io_ref?.emit('wa_cro_connected', {});
      }

      if (connection === 'close') {
        clearTimeout(watchdog);
        if (sock) { try { sock.ev.removeAllListeners(); } catch {} sock = null; }
        connectionStatus = 'disconnected';

        const code = lastDisconnect?.error?.output?.statusCode;
        const errMsg = lastDisconnect?.error?.message || '';
        logger.warn(`[WA CRO Sync] Disconnected — code: ${code} | ${errMsg}`);

        const msSinceConnect = _lastConnectedAt ? Date.now() - _lastConnectedAt : Infinity;
        const freshSession = msSinceConnect < 120000;

        if (code === DisconnectReason.connectionReplaced) {
          _consecutive440s++;
          logger.warn(`[WA CRO Sync] 440 × ${_consecutive440s}`);
          if (_consecutive440s >= 3) {
            _consecutive440s = 0;
            _scheduleReinit(2000, true);
          } else {
            _scheduleReinit(6000, false);
          }
        } else if (code === DisconnectReason.loggedOut) {
          logger.warn('[WA CRO Sync] Logged out (401) — clearing session for fresh QR');
          _scheduleReinit(3000, true);
        } else if (
          code === DisconnectReason.badSession ||
          code === DisconnectReason.multideviceMismatch
        ) {
          if (freshSession) {
            _postConnectRetries++;
            if (_postConnectRetries >= 4) {
              _postConnectRetries = 0;
              _scheduleReinit(3000, true);
            } else {
              _scheduleReinit(4000, false);
            }
          } else {
            _scheduleReinit(3000, true);
          }
        } else {
          _consecutiveGenericFails++;
          if (_consecutiveGenericFails >= 5) {
            _consecutiveGenericFails = 0;
            _scheduleReinit(3000, true);
          } else {
            _scheduleReinit(5000, false);
          }
        }
      }
    });
  } catch (err) {
    connectionStatus = 'unavailable';
    lastError = err.message;
    logger.error(`[WA CRO Sync] Init failed: ${err.message}`);
    logger.error(err.stack || '');
  } finally {
    isInitializing = false;
  }
};

const getStatus = () => connectionStatus;
const getQRCode = () => qrCode;
const isConnected = () => connectionStatus === 'connected';
const getDebugInfo = () => ({ status: connectionStatus, hasSocket: !!sock, lastError, businessNumber: CRO_BUSINESS_NUMBER });

const reinitCroSync = async () => {
  _closeSock();
  isInitializing = false;
  await initWhatsAppCroSync(io_ref);
};

module.exports = { initWhatsAppCroSync, getStatus, getQRCode, isConnected, getDebugInfo, reinitCroSync };
