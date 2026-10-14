const Lead = require('../models/Lead');
const Organization = require('../models/Organization');
const { LEAD_STATUS, LEAD_SOURCES } = require('../utils/constants');
const logger = require('../utils/logger');

// WhatsApp Cloud API sends non-text message types (image, audio, document, ...)
// without a `text.body` — turn those into a readable placeholder instead of dropping them.
const extractText = (message) => {
  if (message.text?.body) return message.text.body;
  if (message.type === 'image') return `[Image]${message.image?.caption ? `: ${message.image.caption}` : ''}`;
  if (message.type === 'video') return `[Video]${message.video?.caption ? `: ${message.video.caption}` : ''}`;
  if (message.type === 'document') return `[Document: ${message.document?.filename || 'file'}]`;
  if (message.type === 'audio') return '[Voice message]';
  if (message.type === 'location') return '[Location shared]';
  return `[${message.type || 'message'}]`;
};

// Handles one Meta Cloud API webhook POST body. Safe to call for every inbound
// event type — non-message events (delivery/read receipts) are ignored.
async function handleInboundWhatsAppWebhook(body) {
  if (body?.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const messages = value.messages || [];
      if (!messages.length) continue; // status webhook (sent/delivered/read) — nothing to log

      const senderName = value.contacts?.[0]?.profile?.name;
      for (const message of messages) {
        await processInboundMessage({ message, senderName }).catch((err) => {
          logger.error(`[WhatsApp Webhook] Failed to process message ${message.id}: ${err.message}`);
        });
      }
    }
  }
}

async function processInboundMessage({ message, senderName }) {
  const cleanPhone = String(message.from || '').replace(/\D/g, '').slice(-10);
  if (cleanPhone.length !== 10) return;

  // Idempotency — Meta redelivers on timeout/retry; skip if already logged.
  const already = await Lead.findOne({ 'communicationLogs.whatsappMessageId': message.id }).select('_id');
  if (already) return;

  // Single-org deployment today — grab the active org. If this ever becomes
  // multi-tenant, map value.metadata.phone_number_id -> organizationId instead.
  const org = await Organization.findOne({ isActive: true });
  if (!org) return;

  const text = extractText(message);
  const happenedAt = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();

  const logEntry = {
    type: 'whatsapp',
    content: text,
    happenedAt,
    whatsappMessageId: message.id,
  };

  const lead = await Lead.findOne({ organizationId: org._id, $or: [{ phone: cleanPhone }, { whatsapp: cleanPhone }] });

  if (lead) {
    logEntry.title = 'Inbound WhatsApp message';
    lead.communicationLogs.push(logEntry);
    lead.lastContactedAt = happenedAt;
    await lead.save();
    logger.info(`[WhatsApp Webhook] Logged inbound message on lead "${lead.name}" (${cleanPhone})`);
    return;
  }

  logEntry.title = 'New WhatsApp inquiry';
  const created = await Lead.create({
    organizationId: org._id,
    name: senderName || `WhatsApp ${cleanPhone}`,
    phone: cleanPhone,
    whatsapp: cleanPhone,
    source: LEAD_SOURCES.WHATSAPP,
    status: LEAD_STATUS.NEW,
    lastContactedAt: happenedAt,
    communicationLogs: [logEntry],
    stageHistory: [{ stage: LEAD_STATUS.NEW, enteredAt: happenedAt }],
  });

  logger.info(`[WhatsApp Webhook] Auto-created lead "${created.name}" (${cleanPhone}) from inbound message`);
}

module.exports = { handleInboundWhatsAppWebhook };
