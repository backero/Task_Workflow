const express = require('express');
const router = express.Router();

const { createOrg, getMyOrg, updateOrg, getMembers, inviteMember, updateMemberRole, removeMember } = require('../controllers/org.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireMinRole } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { createOrgSchema, updateOrgSchema } = require('../validators/org.validator');
const { createUserSchema, updateUserSchema } = require('../validators/user.validator');
const { ROLES } = require('../utils/constants');
const Joi = require('joi');

const inviteSchema = Joi.object({
  phone: Joi.string().pattern(/^\+[1-9]\d{7,14}$/).required(),
  name: Joi.string().min(2).max(100).allow('', null),
  role: Joi.string().valid(ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE).default(ROLES.EMPLOYEE),
  designation: Joi.string().max(100).allow('', null),
  department: Joi.string().max(100).allow('', null),
});

const updateRoleSchema = Joi.object({
  role: Joi.string().valid(ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE).required(),
});

router.use(authenticate);

router.post('/', validate(createOrgSchema), createOrg);
router.get('/', getMyOrg);
router.patch('/', requireMinRole(ROLES.ORG_ADMIN), validate(updateOrgSchema), updateOrg);

router.get('/members', getMembers);
router.post('/members/invite', requireMinRole(ROLES.ADMIN), validate(inviteSchema), inviteMember);
router.patch('/members/:userId/role', requireMinRole(ROLES.ADMIN), validate(updateRoleSchema), updateMemberRole);
router.delete('/members/:userId', requireMinRole(ROLES.ADMIN), removeMember);

module.exports = router;
