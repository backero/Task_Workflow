const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let _transporter = null;

const getTransporter = () => {
  if (_transporter) return _transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logger.warn('[Email] SMTP not configured — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in env vars');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: SMTP_PORT === '465',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return _transporter;
};

const sendOTPEmail = async (toEmail, otp) => {
  const transporter = getTransporter();
  if (!transporter) return false;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    await transporter.sendMail({
      from: `"Backero" <${from}>`,
      to: toEmail,
      subject: 'Your Backero Login OTP',
      text: `Your Backero login OTP is: ${otp}\n\nValid for 10 minutes. Do not share this with anyone.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px">
          <h2 style="color:#1e40af;margin:0 0 8px">Backero Login</h2>
          <p style="color:#475569;margin:0 0 24px">Use the OTP below to sign in to your account.</p>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:24px;text-align:center">
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:1px">Your OTP</p>
            <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:8px;color:#1e293b">${otp}</p>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;text-align:center">Valid for 10 minutes · Do not share this OTP</p>
        </div>
      `,
    });
    logger.info(`[Email] ✅ OTP sent to ${toEmail}`);
    return true;
  } catch (err) {
    logger.error(`[Email] ❌ Failed to ${toEmail}: ${err.message}`);
    return false;
  }
};

module.exports = { sendOTPEmail };
