const User = require('../models/User');
const { success, badRequest, notFound } = require('../utils/response');
const { log } = require('../services/activityLog.service');
const logger = require('../utils/logger');

const getProfile = async (req, res) => {
  return success(res, { user: req.user });
};

const updateProfile = async (req, res) => {
  const { name, email, designation, department } = req.body;
  try {
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { name, email, designation, department } },
      { new: true, runValidators: true }
    ).select('-__v').lean();
    await log({ userId: req.user._id, organizationId: req.user.organizationId, action: 'PROFILE_UPDATED', entity: 'User', entityId: req.user._id });
    return success(res, { user: updated }, 'Profile updated');
  } catch (err) {
    logger.error(`updateProfile: ${err.message}`);
    throw err;
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
      .select('name phone role designation department avatar lastLoginAt createdAt')
      .lean();
    if (!user) return notFound(res, 'User not found');
    return success(res, { user });
  } catch (err) {
    logger.error(`getUserById: ${err.message}`);
    throw err;
  }
};

module.exports = { getProfile, updateProfile, getUserById };
