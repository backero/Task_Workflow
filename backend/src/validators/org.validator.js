const Joi = require('joi');
const { PLANS } = require('../utils/constants');

const createOrgSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  slug: Joi.string()
    .pattern(/^[a-z0-9-]+$/)
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.pattern.base': 'Slug can only contain lowercase letters, numbers, and hyphens',
    }),
  adminName: Joi.string().min(2).max(100).required(),
  adminPhone: Joi.string()
    .pattern(/^\+[1-9]\d{7,14}$/)
    .required()
    .messages({ 'string.pattern.base': 'Admin phone must be in E.164 format' }),
  adminEmail: Joi.string().email().optional().allow('', null),
  plan: Joi.string()
    .valid(...Object.values(PLANS))
    .default(PLANS.FREE),
});

const updateOrgSchema = Joi.object({
  name: Joi.string().min(2).max(100),
  logo: Joi.string().uri().allow('', null),
  plan: Joi.string().valid(...Object.values(PLANS)),
  gstin: Joi.string().allow('', null),
  address: Joi.object({
    line1: Joi.string().allow('', null),
    city: Joi.string().allow('', null),
    state: Joi.string().allow('', null),
    pincode: Joi.string().allow('', null),
    country: Joi.string().allow('', null),
  }),
  settings: Joi.object({
    timezone: Joi.string(),
    currency: Joi.string(),
  }),
}).min(1);

module.exports = { createOrgSchema, updateOrgSchema };
