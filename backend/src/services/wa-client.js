/**
 * Zero-cost WhatsApp client using @whiskeysockets/baileys
 *
 * Uses WhatsApp Multi-Device protocol directly (pure WebSocket — no Chromium).
 * Much more reliable QR scanning than whatsapp-web.js.
 *
 * First run: QR code printed in terminal → scan with WhatsApp mobile.
 * Session saved to ./wa-session/ — never scan again.
 */

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
const logger     = require('../utils/logger');

// Silent pino logger for Baileys internals (suppresses noisy internal logs)
const baileysLogger = pino({ level: 'silent' });

const SESSION_PATH = path.join(__dirname, '../../wa-session');

let sock  = null;
let ready = false;

const init = async () => {
  try {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

    sock = makeWASocket({
      version,
      auth:   state,
      logger: baileysLogger,       // silences Baileys internal noise
      printQRInTerminal: false,    // we print it ourselves via qrcode-terminal
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info('\n========================================');
        logger.info('  SCAN THIS QR CODE WITH WHATSAPP');
        logger.info('  Phone → Linked Devices → Link a Device');
        logger.info('========================================\n');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        ready = true;
        logger.info('[WhatsApp] Connected and ready — messages will be sent for free');
      }

      if (connection === 'close') {
        ready = false;
        const statusCode = lastDisconnect?.error ? new Boom(lastDisconnect.error)?.output?.statusCode : null;
        const loggedOut  = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          logger.warn('[WhatsApp] Logged out — delete wa-session/ folder and restart to re-scan QR');
        } else {
          logger.info('[WhatsApp] Disconnected — reconnecting in 5s…');
          setTimeout(init, 5000);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (err) {
    logger.error(`[WhatsApp] Init error: ${err.message}`);
    setTimeout(init, 10000);
  }
};

/**
 * Send a plain WhatsApp message.
 * @param {string} phone  International format e.g. "+919876543210"
 * @param {string} message  Plain text (supports *bold*, _italic_ WhatsApp markdown)
 */
const send = async (phone, message) => {
  if (!ready || !sock) {
    logger.warn(`[WhatsApp] Not ready — message to ${phone} dropped`);
    return { success: false, error: 'not_ready' };
  }
  try {
    const number = phone.replace(/\D/g, ''); // strip non-digits
    const jid    = `${number}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    logger.info(`[WhatsApp] Sent to ${phone}`);
    return { success: true };
  } catch (err) {
    logger.error(`[WhatsApp] Failed to send to ${phone}: ${err.message}`);
    return { success: false, error: err.message };
  }
};

const isReady = () => ready;

module.exports = { init, send, isReady };
