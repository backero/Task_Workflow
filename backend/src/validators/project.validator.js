const Joi = require('joi');
const { PROJECT_STATUSES } = require('../models/Project');

const createProjectSchema = Joi.object({
  title: Joi.string().min(2).max(150).required(),
  description: Joi.string().max(1000).allow('', null),
  color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  dueDate: Joi.date().iso().allow(null),
});

const updateProjectSchema = Joi.object({
  title: Joi.string().min(2).max(150),
  description: Joi.string().max(1000).allow('', null),
  color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/),
  status: Joi.string().valid(...PROJECT_STATUSES),
  dueDate: Joi.date().iso().allow(null),
}).min(1);

module.exports = { createProjectSchema, updateProjectSchema };
