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
let qrVersion = 0;
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
// A JID's "user" part can carry a ":<deviceId>" suffix (e.g. "918848575827:0@s.whatsapp.net" for
// a linked device). Confirmed bug: stripping non-digits from the whole string before dropping
// that suffix merges the device index straight onto the phone number (918848575827 -> wrongly
// 9188485758270). Split on ':' first so only the real number's digits remain.
const jidToDigits = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

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

async function persistMessage(msg, source = 'live') {
  if (!msg.message) return; // reaction/protocol-only entries carry no content
  let remoteJid = msg.key?.remoteJid;
  // Groups and status broadcasts are never a real 1:1 customer chat — exclude only those.
  if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

  // WhatsApp now addresses many 1:1 chats by @lid (an opaque per-contact privacy ID) instead of
  // the phone-number JID (@s.whatsapp.net) — confirmed most incoming chats on this account use
  // it. Stored as-is, a @lid contact can never be matched back to a Lead's phone number, so a
  // real client's chat (e.g. an international number) would sync in but never show up linked to
  // them. Baileys keeps its own LID↔phone-number mapping (needed internally for message
  // decryption) — resolve through it here so `contact` is always the real phone number when
  // Baileys already knows it.
  if (remoteJid.endsWith('@lid') && sock?.signalRepository?.lidMapping) {
    try {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(remoteJid);
      if (pn) remoteJid = pn;
    } catch { /* no mapping yet for this LID — fall back to storing the LID itself below */ }
  }

  const contact = jidToDigits(remoteJid);
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
          source,
        },
      },
      { upsert: true }
    );
    linkToProductionQA(orgId, contact).catch((err) => logger.error(`[WA CRO Sync] QA link failed: ${err.message}`));
  } catch (err) {
    logger.error(`[WA CRO Sync] Failed to persist message ${msg.key.id}: ${err.message}`);
  }
}

// One-time-per-connection backfill: messages persisted before the @lid→phone-number resolution
// above existed are stuck under an opaque LID as `contact`, which can never match a Lead's phone
// number. Re-resolves each distinct LID-shaped contact already stored for this business number
// through the now-live lidMapping and renames it to the real number wherever Baileys has one.
async function backfillLidContacts(orgId) {
  if (!sock?.signalRepository?.lidMapping) {
    logger.warn('[WA CRO Sync] Backfill: no live signalRepository/lidMapping — skipping');
    return;
  }
  try {
    const contacts = await WaChatMessage.distinct('contact', { organizationId: orgId, business: CRO_BUSINESS_NUMBER });
    // Real phone numbers (with country code) run up to 13-ish digits in every number seen on
    // this account (India: 12, the +1 Canada one: 11); every LID seen has been 15+ digits. 13
    // leaves margin without wrongly treating a genuine longer LID as if it were already real.
    const candidates = contacts.filter((c) => c.length > 13);
    logger.info(`[WA CRO Sync] Backfill: ${contacts.length} distinct contact(s), ${candidates.length} LID-shaped candidate(s)`);
    let resolved = 0;
    for (const c of candidates) {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(`${c}@lid`).catch((err) => {
        logger.warn(`[WA CRO Sync] Backfill: getPNForLID(${c}) failed: ${err.message}`);
        return null;
      });
      if (!pn) continue;
      const realContact = jidToDigits(pn);
      if (!realContact || realContact === c) continue;
      await WaChatMessage.updateMany({ organizationId: orgId, business: CRO_BUSINESS_NUMBER, contact: c }, { $set: { contact: realContact } });
      logger.info(`[WA CRO Sync] Backfill: ${c} -> ${realContact}`);
      resolved++;
      linkToProductionQA(orgId, realContact).catch(() => {});
    }
    logger.info(`[WA CRO Sync] Backfill done: resolved ${resolved} of ${candidates.length} LID contact(s)`);
  } catch (err) {
    logger.error(`[WA CRO Sync] LID backfill error: ${err.message}`);
  }
}

async function linkToProductionQA(orgId, contactNumber) {
  try {
    // Only link to a client that was already uploaded (by their phone/phone2/whatsapp number) —
    // never create a new Lead/KYC entry from a WhatsApp number alone. Matches against 10-digit
    // and 91-prefixed variants since a lead's stored number may not be in the exact digit form
    // WhatsApp's JID uses.
    const ten = contactNumber.slice(-10);
    const variants = [...new Set([contactNumber, ten, `91${ten}`])];
    const lead = await Lead.findOne({
      organizationId: orgId,
      $or: [{ phone: { $in: variants } }, { phone2: { $in: variants } }, { whatsapp: { $in: variants } }],
    });
    if (!lead) return;

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

    // The AI summary is a nice-to-have on top of the real thing this function exists for
    // (linking the chat to a Lead + ProductionQuery) — it must never block that on its own
    // failure (confirmed: a missing/invalid GROQ_API_KEY was throwing here and silently
    // skipping Lead/ProductionQuery creation entirely for every single incoming message).
    const summary = await summarizeWhatsAppChat(chatText).catch((err) => {
      logger.error(`[WA CRO Sync] AI summary failed (continuing without it): ${err.message}`);
      return null;
    });

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

    if (summary) await WaChatSummary.updateOne(
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
      syncFullHistory: true,
      logger: silentLogger,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages || []) {
        await persistMessage(msg).catch((err) => logger.error(`[WA CRO Sync] ${err.message}`));
      }
    });

    // One-time bulk delivery of existing chat history after linking (only fires with
    // syncFullHistory: true above) — without this handler, only messages sent/received
    // AFTER the connection opens were ever captured; pre-existing conversations never
    // showed up here even though the "linked device" itself has the full history.
    sock.ev.on('messaging-history.set', async ({ messages, isLatest }) => {
      logger.info(`[WA CRO Sync] History sync: ${messages?.length || 0} messages (isLatest=${isLatest})`);
      for (const msg of messages || []) {
        await persistMessage(msg, 'history').catch((err) => logger.error(`[WA CRO Sync] history persist: ${err.message}`));
      }
    });

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        qrCode = qr;
        qrVersion += 1;
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
        // Delayed so it runs after history-sync batches (which can keep arriving for a bit
        // after "open") have landed, rather than racing them.
        const orgId = process.env.WA_CHATS_ORG_ID;
        if (orgId) setTimeout(() => backfillLidContacts(orgId), 60000);
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
const getDebugInfo = () => ({ status: connectionStatus, hasSocket: !!sock, lastError, businessNumber: CRO_BUSINESS_NUMBER, qrVersion });

const reinitCroSync = async () => {
  _closeSock();
  isInitializing = false;
  await initWhatsAppCroSync(io_ref);
};

module.exports = { initWhatsAppCroSync, getStatus, getQRCode, isConnected, getDebugInfo, reinitCroSync };
