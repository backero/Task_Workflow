const crypto = require('crypto');
const OtpLog = require('../models/OtpLog');
const { sendOtp } = require('./sms.service');
const { OTP_EXPIRY_MINUTES, OTP_LENGTH, OTP_MAX_ATTEMPTS } = require('../config/env');
const logger = require('../utils/logger');

const generateOtp = () => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
};

const requestOtp = async (phone, ipAddress = null, userAgent = null) => {
  // Invalidate any existing unused OTPs for this phone
  await OtpLog.updateMany(
    { phone, isUsed: false },
    { $set: { isUsed: true } }
  );

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await OtpLog.create({ phone, otp, expiresAt, ipAddress, userAgent });

  await sendOtp(phone, otp);

  return { expiresAt, otp };
};

const verifyOtp = async (phone, inputOtp) => {
  const record = await OtpLog.findOne({
    phone,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!record) {
    return { valid: false, reason: 'OTP expired or not found' };
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    record.isUsed = true;
    await record.save();
    return { valid: false, reason: 'Too many attempts. Request a new OTP.' };
  }

  if (record.otp !== inputOtp) {
    record.attempts += 1;
    await record.save();
    const remaining = OTP_MAX_ATTEMPTS - record.attempts;
    return {
      valid: false,
      reason: `Incorrect OTP. ${remaining} attempt(s) remaining.`,
    };
  }

  record.isUsed = true;
  await record.save();

  return { valid: true };
};

module.exports = { requestOtp, verifyOtp };
