const Organization = require('../models/Organization');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { success, created, badRequest, notFound, forbidden } = require('../utils/response');
const { emitToUser, emitToOrg } = require('../sockets/index');
const { log } = require('../services/activityLog.service');
const { ROLES } = require('../utils/constants');
const logger = require('../utils/logger');

const createOrg = async (req, res) => {
  const { name, slug } = req.body;
  try {
    if (req.user.organizationId) {
      return badRequest(res, 'You are already part of an organization');
    }
    const existing = await Organization.findOne({ slug });
    if (existing) return badRequest(res, 'Slug already taken. Choose another.');

    const org = await Organization.create({ name, slug, createdBy: req.user._id });

    await User.findByIdAndUpdate(req.user._id, {
      organizationId: org._id,
      role: ROLES.ORG_ADMIN,
      name: req.body.adminName || req.user.name || 'Admin',
    });

    await log({ userId: req.user._id, organizationId: org._id, action: 'ORG_CREATED', entity: 'Organization', entityId: org._id });

    return created(res, { org }, 'Organization created successfully');
  } catch (err) {
    logger.error(`createOrg: ${err.message}`);
    if (err.code === 11000) return badRequest(res, 'Slug already taken');
    throw err;
  }
};

const getMyOrg = async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId).lean();
    if (!org) return notFound(res, 'Organization not found');
    return success(res, { org });
  } catch (err) {
    logger.error(`getMyOrg: ${err.message}`);
    throw err;
  }
};

const updateOrg = async (req, res) => {
  try {
    const org = await Organization.findByIdAndUpdate(
      req.user.organizationId,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!org) return notFound(res, 'Organization not found');
    emitToOrg(org._id.toString(), 'org:updated', { org });
    return success(res, { org }, 'Organization updated');
  } catch (err) {
    logger.error(`updateOrg: ${err.message}`);
    throw err;
  }
};

const getMembers = async (req, res) => {
  try {
    const members = await User.find({ organizationId: req.user.organizationId, isActive: true })
      .select('name phone role designation department avatar lastLoginAt createdAt')
      .lean();
    return success(res, { members, total: members.length });
  } catch (err) {
    logger.error(`getMembers: ${err.message}`);
    throw err;
  }
};

const inviteMember = async (req, res) => {
  const { phone, name, role, designation, department } = req.body;
  try {
    let user = await User.findOne({ phone });
    if (user && user.organizationId && user.organizationId.toString() !== req.user.organizationId.toString()) {
      return badRequest(res, 'This user already belongs to another organization');
    }

    const isNew = !user;
    if (!user) {
      user = await User.create({ phone, name: name || '', organizationId: req.user.organizationId, role: role || ROLES.EMPLOYEE, designation, department });
    } else {
      await User.findByIdAndUpdate(user._id, {
        organizationId: req.user.organizationId,
        role: role || ROLES.EMPLOYEE,
        name: name || user.name,
        designation: designation || user.designation,
        department: department || user.department,
      });
      user = await User.findById(user._id).lean();
    }

    // Notify via socket if user is online
    const notif = await Notification.create({
      userId: user._id,
      organizationId: req.user.organizationId,
      type: 'MEMBER_ADDED',
      title: 'You have been added to an organization',
      message: `You have been added to the organization by ${req.user.name || req.user.phone}`,
      entityType: 'Organization',
      entityId: req.user.organizationId,
    });
    emitToUser(user._id.toString(), 'notification', notif);

    await log({ userId: req.user._id, organizationId: req.user.organizationId, action: 'MEMBER_INVITED', entity: 'User', entityId: user._id });

    return success(res, { user, isNew }, isNew ? 'Member account created and added' : 'Member added to organization');
  } catch (err) {
    logger.error(`inviteMember: ${err.message}`);
    throw err;
  }
};

const updateMemberRole = async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  try {
    if (userId === req.user._id.toString()) return badRequest(res, 'Cannot change your own role');
    const member = await User.findOneAndUpdate(
      { _id: userId, organizationId: req.user.organizationId },
      { role },
      { new: true }
    ).select('name phone role');
    if (!member) return notFound(res, 'Member not found');
    emitToOrg(req.user.organizationId.toString(), 'member:role_updated', { userId, role });
    return success(res, { member }, 'Role updated');
  } catch (err) {
    logger.error(`updateMemberRole: ${err.message}`);
    throw err;
  }
};

const removeMember = async (req, res) => {
  const { userId } = req.params;
  try {
    if (userId === req.user._id.toString()) return badRequest(res, 'Cannot remove yourself');
    const member = await User.findOneAndUpdate(
      { _id: userId, organizationId: req.user.organizationId },
      { isActive: false, organizationId: null },
      { new: true }
    );
    if (!member) return notFound(res, 'Member not found');
    emitToOrg(req.user.organizationId.toString(), 'member:removed', { userId });
    return success(res, {}, 'Member removed');
  } catch (err) {
    logger.error(`removeMember: ${err.message}`);
    throw err;
  }
};

module.exports = { createOrg, getMyOrg, updateOrg, getMembers, inviteMember, updateMemberRole, removeMember };
