require('dotenv').config();

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key, fallback) => process.env[key] || fallback;

module.exports = {
  PORT: parseInt(optional('PORT', '5000'), 10),
  NODE_ENV: optional('NODE_ENV', 'development'),
  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:5173'),

  MONGO_URI: required('MONGO_URI'),

  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '7d'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_REFRESH_EXPIRES_IN: optional('JWT_REFRESH_EXPIRES_IN', '30d'),

  OTP_EXPIRY_MINUTES: parseInt(optional('OTP_EXPIRY_MINUTES', '5'), 10),
  OTP_MAX_ATTEMPTS: parseInt(optional('OTP_MAX_ATTEMPTS', '3'), 10),
  OTP_LENGTH: parseInt(optional('OTP_LENGTH', '6'), 10),

  SMTP_HOST: optional('SMTP_HOST', ''),
  SMTP_PORT: optional('SMTP_PORT', '587'),
  SMTP_USER: optional('SMTP_USER', ''),
  SMTP_PASS: optional('SMTP_PASS', ''),
  SMTP_FROM: optional('SMTP_FROM', 'noreply@backero.in'),
  REDIS_URL: optional('REDIS_URL', ''),

  // WhatsApp
  WHATSAPP_PROVIDER: optional('WHATSAPP_PROVIDER', 'console'),
  WATI_API_URL:      optional('WATI_API_URL', ''),
  WATI_ACCESS_TOKEN: optional('WATI_ACCESS_TOKEN', ''),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: optional('CLOUDINARY_CLOUD_NAME', ''),
  CLOUDINARY_API_KEY:    optional('CLOUDINARY_API_KEY', ''),
  CLOUDINARY_API_SECRET: optional('CLOUDINARY_API_SECRET', ''),

  SMS_PROVIDER: optional('SMS_PROVIDER', 'console'),
  MSG91_AUTH_KEY: optional('MSG91_AUTH_KEY', ''),
  MSG91_TEMPLATE_ID: optional('MSG91_TEMPLATE_ID', ''),
  MSG91_SENDER_ID: optional('MSG91_SENDER_ID', 'BCKERO'),
  TWILIO_ACCOUNT_SID: optional('TWILIO_ACCOUNT_SID', ''),
  TWILIO_AUTH_TOKEN: optional('TWILIO_AUTH_TOKEN', ''),
  TWILIO_PHONE_NUMBER: optional('TWILIO_PHONE_NUMBER', ''),
};
