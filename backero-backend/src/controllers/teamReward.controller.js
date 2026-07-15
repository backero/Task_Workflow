const TeamReward = require('../models/TeamReward');
const User = require('../models/User');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { ROLE_HIERARCHY } = require('../utils/constants');
const { bulkCreateNotifications } = require('../services/notification.service');

const REWARD_LABELS = {
  congrats_game: 'a congratulations note + game outing',
  refreshments: 'refreshments on the house',
  early_leave: '1 hour paid early leave',
};

// GET /api/team-rewards
exports.getTeamRewards = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const { skip } = paginate(page, limit);

  const filter = { organizationId: req.user.organizationId };
  if (status) filter.status = status;

  const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
  if (userLevel < ROLE_HIERARCHY['admin']) {
    // Managers / team leads only see their own department's rewards
    filter.department = req.user.department;
  }

  const [rewards, total] = await Promise.all([
    TeamReward.find(filter)
      .populate('memberIds', 'firstName lastName avatar')
      .populate('grantedBy', 'firstName lastName')
      .sort({ weekStart: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    TeamReward.countDocuments(filter),
  ]);

  sendSuccess(res, paginateResponse(rewards, total, page, limit));
});

// Helper: can this user act on a reward for `department`?
const canActOnDepartment = (req, department) => {
  const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
  if (userLevel >= ROLE_HIERARCHY['admin']) return true;
  return userLevel >= ROLE_HIERARCHY['manager'] && req.user.department === department;
};

// POST /api/team-rewards/:id/grant  { rewardType, note }
exports.grantTeamReward = asyncHandler(async (req, res) => {
  const { rewardType, note } = req.body;
  if (!['congrats_game', 'refreshments', 'early_leave'].includes(rewardType)) {
    return sendError(res, 'Invalid reward type.', 400);
  }

  const reward = await TeamReward.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!reward) return sendError(res, 'Reward not found.', 404);
  if (reward.status !== 'pending') return sendError(res, `This reward was already ${reward.status}.`, 400);
  if (!canActOnDepartment(req, reward.department)) return sendError(res, 'Access denied.', 403);

  reward.status = 'granted';
  reward.rewardType = rewardType;
  reward.note = note?.trim();
  reward.grantedBy = req.user._id;
  reward.grantedAt = new Date();
  await reward.save();

  const io = req.app.get('io');
  await bulkCreateNotifications(reward.memberIds, {
    organizationId: req.user.organizationId,
    title: `🎉 Congratulations, ${reward.department}!`,
    message: `Your team completed every task and daily update on time these last 2 weeks — you've earned ${REWARD_LABELS[rewardType]}.${note ? ` Note: ${note.trim()}` : ''}`,
    type: 'reward',
    priority: 'medium',
    actionUrl: '/management/team-rewards',
    channels: { inApp: true, whatsapp: true },
  }, io);

  sendSuccess(res, { reward }, 'Reward granted');
});

// POST /api/team-rewards/:id/skip
exports.skipTeamReward = asyncHandler(async (req, res) => {
  const reward = await TeamReward.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!reward) return sendError(res, 'Reward not found.', 404);
  if (reward.status !== 'pending') return sendError(res, `This reward was already ${reward.status}.`, 400);
  if (!canActOnDepartment(req, reward.department)) return sendError(res, 'Access denied.', 403);

  reward.status = 'skipped';
  await reward.save();

  sendSuccess(res, { reward }, 'Reward dismissed');
});
