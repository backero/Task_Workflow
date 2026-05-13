const Joi = require('joi');

const phoneSchema = Joi.string()
  .pattern(/^\+[1-9]\d{7,14}$/)
  .required()
  .messages({
    'string.pattern.base': 'Phone must be in E.164 format (e.g. +919876543210)',
    'any.required': 'Phone number is required',
  });

const requestOtpSchema = Joi.object({
  phone: phoneSchema,
});

const verifyOtpSchema = Joi.object({
  phone: phoneSchema,
  otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
    'string.length': 'OTP must be exactly 6 digits',
    'string.pattern.base': 'OTP must contain only digits',
    'any.required': 'OTP is required',
  }),
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

module.exports = { requestOtpSchema, verifyOtpSchema, refreshTokenSchema };
