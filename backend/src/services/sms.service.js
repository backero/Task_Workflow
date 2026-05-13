const axios = require('axios');
const logger = require('../utils/logger');
const { SMS_PROVIDER, MSG91_AUTH_KEY, MSG91_TEMPLATE_ID, MSG91_SENDER_ID } = require('../config/env');

const sendViaConsole = (phone, otp) => {
  logger.info(`[SMS:CONSOLE] OTP for ${phone}: ${otp}`);
  return { success: true, provider: 'console' };
};

const sendViaMsg91 = async (phone, otp) => {
  // MSG91 Flow API
  const normalizedPhone = phone.replace('+', '');
  try {
    const { data } = await axios.post(
      'https://control.msg91.com/api/v5/flow',
      {
        template_id: MSG91_TEMPLATE_ID,
        short_url: '0',
        recipients: [
          {
            mobiles: normalizedPhone,
            otp,
          },
        ],
      },
      {
        headers: {
          authkey: MSG91_AUTH_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    logger.info(`[SMS:MSG91] Sent OTP to ${phone}. Response: ${JSON.stringify(data)}`);
    return { success: true, provider: 'msg91', response: data };
  } catch (err) {
    logger.error(`[SMS:MSG91] Failed to send OTP to ${phone}: ${err.message}`);
    throw new Error('Failed to send OTP via MSG91');
  }
};

const sendViaTwilio = async (phone, otp) => {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER,
  } = require('../config/env');

  try {
    const { data } = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        To: phone,
        From: TWILIO_PHONE_NUMBER,
        Body: `Your Backero OTP is ${otp}. Valid for 5 minutes. Do not share this with anyone.`,
      }),
      {
        auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    logger.info(`[SMS:TWILIO] Sent OTP to ${phone}. SID: ${data.sid}`);
    return { success: true, provider: 'twilio', sid: data.sid };
  } catch (err) {
    logger.error(`[SMS:TWILIO] Failed to send OTP to ${phone}: ${err.message}`);
    throw new Error('Failed to send OTP via Twilio');
  }
};

const sendOtp = async (phone, otp) => {
  switch (SMS_PROVIDER) {
    case 'msg91':
      return sendViaMsg91(phone, otp);
    case 'twilio':
      return sendViaTwilio(phone, otp);
    default:
      return sendViaConsole(phone, otp);
  }
};

module.exports = { sendOtp };
