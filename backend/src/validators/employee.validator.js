const Joi = require('joi');
const { ROLES } = require('../utils/constants');

const ASSIGNABLE_ROLES = [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.HR, ROLES.ADMIN];

const createEmployeeSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^\+[1-9]\d{7,14}$/)
    .required()
    .messages({ 'string.pattern.base': 'Phone must be in E.164 format (e.g. +919876543210)' }),
  name: Joi.string().min(1).max(100).required(),
  email: Joi.string().email().optional().allow('', null),
  role: Joi.string().valid(...ASSIGNABLE_ROLES).default(ROLES.EMPLOYEE),
  department: Joi.string().max(100).allow('', null).optional(),
  designation: Joi.string().max(100).allow('', null).optional(),
  joiningDate: Joi.date().iso().optional().allow(null),
});

const updateEmployeeSchema = Joi.object({
  name: Joi.string().min(1).max(100),
  email: Joi.string().email().allow('', null),
  role: Joi.string().valid(...ASSIGNABLE_ROLES),
  department: Joi.string().max(100).allow('', null),
  designation: Joi.string().max(100).allow('', null),
  joiningDate: Joi.date().iso().allow(null),
}).min(1);

module.exports = { createEmployeeSchema, updateEmployeeSchema };
