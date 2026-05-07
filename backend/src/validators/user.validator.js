const Joi = require('joi');
const { ROLES } = require('../utils/constants');

const createUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  phone: Joi.string()
    .pattern(/^\+[1-9]\d{7,14}$/)
    .required()
    .messages({ 'string.pattern.base': 'Phone must be in E.164 format (e.g. +919876543210)' }),
  email: Joi.string().email().optional().allow('', null),
  role: Joi.string()
    .valid(ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE)
    .default(ROLES.EMPLOYEE),
  designation: Joi.string().max(100).allow('', null),
  department: Joi.string().max(100).allow('', null),
});

const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(100),
  email: Joi.string().email().allow('', null),
  role: Joi.string().valid(ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE),
  designation: Joi.string().max(100).allow('', null),
  department: Joi.string().max(100).allow('', null),
  isActive: Joi.boolean(),
}).min(1);

module.exports = { createUserSchema, updateUserSchema };
