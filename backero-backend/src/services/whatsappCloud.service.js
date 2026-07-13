const logger = require('../utils/logger');

const GRAPH_VERSION = 'v20.0';

function isConfigured() {
  return !!(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN && process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID);
}

function toWhatsAppId(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

// Sends the approved AUTHENTICATION template (body {{1}} + Copy Code button {{1}}).
async function sendOTP(phone, otp) {
  if (!isConfigured()) {
    logger.warn('[WhatsApp Cloud] Not configured (missing access token / phone number ID) — skipping OTP send');
    return false;
  }
  const to = toWhatsAppId(phone);
  const templateName = process.env.WHATSAPP_CLOUD_OTP_TEMPLATE || 'temp1';
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: String(otp) }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(otp) }] },
      ],
    },
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      logger.error(`[WhatsApp Cloud] OTP send failed for +${to}: ${JSON.stringify(json.error || json)}`);
      return false;
    }
    logger.info(`[WhatsApp Cloud] ✅ OTP template sent to +${to} (message id: ${json.messages?.[0]?.id})`);
    return true;
  } catch (err) {
    logger.error(`[WhatsApp Cloud] OTP send error for +${to}: ${err.message}`);
    return false;
  }
}

module.exports = { isConfigured, sendOTP };
