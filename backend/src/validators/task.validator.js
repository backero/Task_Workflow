const Joi = require('joi');
const { TASK_STATUSES, TASK_PRIORITIES } = require('../models/Task');

const objectId = Joi.string().hex().length(24)

const createTaskSchema = Joi.object({
  title: Joi.string().min(2).max(200).required(),
  description: Joi.string().max(5000).allow('', null),
  projectId: objectId.required(),
  assigneeId: objectId.allow(null, ''),
  priority: Joi.string().valid(...TASK_PRIORITIES).default('MEDIUM'),
  dueDate: Joi.date().iso().allow(null),
  tags: Joi.array().items(Joi.string().max(30)).max(10).default([]),
  labelIds: Joi.array().items(objectId).max(10).default([]),
  estimatedMinutes: Joi.number().integer().min(1).max(100000).allow(null),
});

const updateTaskSchema = Joi.object({
  title: Joi.string().min(2).max(200),
  description: Joi.string().max(5000).allow('', null),
  assigneeId: objectId.allow(null, ''),
  priority: Joi.string().valid(...TASK_PRIORITIES),
  dueDate: Joi.date().iso().allow(null),
  tags: Joi.array().items(Joi.string().max(30)).max(10),
  labelIds: Joi.array().items(objectId).max(10),
  estimatedMinutes: Joi.number().integer().min(1).max(100000).allow(null),
}).min(1);

const updateStatusSchema = Joi.object({
  status: Joi.string().valid(...TASK_STATUSES).required(),
});

const addCommentSchema = Joi.object({
  text: Joi.string().min(1).max(2000).required(),
});

module.exports = { createTaskSchema, updateTaskSchema, updateStatusSchema, addCommentSchema };
