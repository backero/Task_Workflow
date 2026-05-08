const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom }   = require('@hapi/boom');
const pino       = require('pino');
const qrcode     = require('qrcode-terminal');
const path       = require('path');
const fs         = require('fs');
const logger     = require('../utils/logger');

const IS_PROD       = process.env.NODE_ENV === 'production';
const baileysLogger = pino({ level: 'silent' });
const SESSION_PATH  = path.join(__dirname, '../../wa-session');

let sock      = null;
let ready     = false;
let retries   = 0;
let latestQR  = null;

// Buffer messages that arrive before the connection is open
const pendingQueue = [];

const flushQueue = async () => {
  while (pendingQueue.length > 0 && ready && sock) {
    const { phone, message, resolve } = pendingQueue.shift();
    resolve(await _sendNow(phone, message));
  }
};

const _sendNow = async (phone, message) => {
  try {
    const number = phone.replace(/\D/g, '');
    const jid    = `${number}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    logger.info(`[WhatsApp] Sent to ${phone}`);
    return { success: true };
  } catch (err) {
    logger.error(`[WhatsApp] Failed to send to ${phone}: ${err.message}`);
    return { success: false, error: err.message };
  }
};

const clearSession = async () => {
  if (IS_PROD) {
    const { useMongoAuthState } = require('./wa-mongo-auth');
    const { clearSession: mongoClear } = await useMongoAuthState('wa');
    await mongoClear().catch(() => {});
    logger.warn('[WhatsApp] MongoDB session cleared — will show fresh QR');
  } else {
    try {
      if (fs.existsSync(SESSION_PATH)) {
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        logger.warn('[WhatsApp] File session cleared — will show fresh QR');
      }
    } catch { /* ignore */ }
  }
};

const init = async () => {
  try {
    const { version } = await fetchLatestBaileysVersion();

    let state, saveCreds;
    if (IS_PROD) {
      const { useMongoAuthState } = require('./wa-mongo-auth');
      const mongoAuth = await useMongoAuthState('wa');
      state      = mongoAuth.state;
      saveCreds  = mongoAuth.saveCreds;
    } else {
      const fileAuth = await useMultiFileAuthState(SESSION_PATH);
      state     = fileAuth.state;
      saveCreds = fileAuth.saveCreds;
    }

    sock = makeWASocket({
      version,
      auth:              state,
      logger:            baileysLogger,
      printQRInTerminal: false,
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestQR = qr;
        const qrUrl = IS_PROD
          ? `${process.env.BACKEND_URL || ''}/api/whatsapp/qr`
          : 'http://localhost:5000/api/whatsapp/qr';
        logger.info(`[WhatsApp] New QR ready — open ${qrUrl} in browser to scan`);
        if (!IS_PROD) qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        ready    = true;
        retries  = 0;
        latestQR = null;
        logger.info('[WhatsApp] Connected — flushing any queued messages…');
        flushQueue();
      }

      if (connection === 'close') {
        ready = false;
        const statusCode = lastDisconnect?.error
          ? new Boom(lastDisconnect.error)?.output?.statusCode
          : null;

        if (statusCode === DisconnectReason.loggedOut) {
          logger.warn('[WhatsApp] Logged out — clearing session and requesting new QR…');
          clearSession().finally(() => setTimeout(init, 3000));
        } else {
          retries++;
          const delay = Math.min(5000 * retries, 30000);
          logger.info(`[WhatsApp] Disconnected — reconnecting in ${delay / 1000}s (attempt ${retries})`);
          setTimeout(init, delay);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (err) {
    logger.error(`[WhatsApp] Init error: ${err.message}`);
    if (!IS_PROD && (err.message?.includes('JSON') || err.message?.includes('parse'))) {
      clearSession();
    }
    retries++;
    setTimeout(init, Math.min(5000 * retries, 30000));
  }
};

/**
 * Send a WhatsApp message.
 * If not yet connected, queues the message and sends it once connection opens.
 */
const send = async (phone, message) => {
  if (!phone) return { success: false, error: 'no_phone' };

  if (ready && sock) {
    return _sendNow(phone, message);
  }

  // Queue it — will be flushed when connection opens
  logger.info(`[WhatsApp] Queuing message to ${phone} (connecting…)`);
  return new Promise((resolve) => {
    pendingQueue.push({ phone, message, resolve });
    // Drop if still not connected after 60s
    setTimeout(() => {
      const idx = pendingQueue.findIndex(item => item.resolve === resolve);
      if (idx !== -1) {
        pendingQueue.splice(idx, 1);
        logger.warn(`[WhatsApp] Queued message to ${phone} expired (never connected)`);
        resolve({ success: false, error: 'connection_timeout' });
      }
    }, 60000);
  });
};

const sendFile = async (phone, buffer, filename, mimetype) => {
  if (!phone) return { success: false, error: 'no_phone' };
  if (!ready || !sock) return { success: false, error: 'not_connected' };
  try {
    const number = phone.replace(/\D/g, '');
    const jid    = `${number}@s.whatsapp.net`;
    await sock.sendMessage(jid, { document: buffer, mimetype, fileName: filename });
    logger.info(`[WhatsApp] File "${filename}" sent to ${phone}`);
    return { success: true };
  } catch (err) {
    logger.error(`[WhatsApp] Failed to send file to ${phone}: ${err.message}`);
    return { success: false, error: err.message };
  }
};

const isReady     = () => ready;
const getLatestQR = () => latestQR;

module.exports = { init, send, sendFile, isReady, getLatestQR };
