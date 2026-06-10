const logger = require('../utils/logger');

/**
 * Send OTP via Fast2SMS (https://fast2sms.com)
 * Sign up → API → DLT settings → copy Authorization key → set FAST2SMS_API_KEY in Render env vars
 */
const sendSMSOTP = async (phone, otp) => {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    logger.warn('[SMS] FAST2SMS_API_KEY not set — OTP not delivered');
    return false;
  }

  const digits = phone.replace(/\D/g, '');
  // Fast2SMS expects 10-digit number without country code
  const number = digits.length === 12 ? digits.slice(2) : digits.length === 11 ? digits.slice(1) : digits;

  const message = `Your Backero login OTP is ${otp}. Valid for 10 minutes. Do not share this.`;

  try {
    const url = new URL('https://www.fast2sms.com/dev/bulkV2');
    url.searchParams.set('authorization', apiKey);
    url.searchParams.set('route', 'q');
    url.searchParams.set('message', message);
    url.searchParams.set('numbers', number);
    url.searchParams.set('flash', '0');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'cache-control': 'no-cache' },
    });

    const data = await res.json();

    if (data.return === true) {
      logger.info(`[SMS] ✅ OTP sent to ${number} — request_id: ${data.request_id}`);
      return true;
    }

    logger.error(`[SMS] Fast2SMS rejected: ${JSON.stringify(data)}`);
    return false;
  } catch (err) {
    logger.error(`[SMS] Error sending to ${number}: ${err.message}`);
    return false;
  }
};

module.exports = { sendSMSOTP };
