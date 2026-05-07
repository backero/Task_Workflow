const Notification = require('../models/Notification');
const { success } = require('../utils/response');
const logger = require('../utils/logger');

const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Notification.countDocuments({ userId: req.user._id }),
      Notification.countDocuments({ userId: req.user._id, isRead: false }),
    ]);
    return success(res, { notifications, total, unreadCount });
  } catch (err) {
    logger.error(`getNotifications: ${err.message}`);
    throw err;
  }
};

const markRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, isRead: false }, { $set: { isRead: true } });
    return success(res, {}, 'All notifications marked as read');
  } catch (err) {
    logger.error(`markRead: ${err.message}`);
    throw err;
  }
};

const markOneRead = async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: { isRead: true } });
    return success(res, {}, 'Notification marked as read');
  } catch (err) {
    logger.error(`markOneRead: ${err.message}`);
    throw err;
  }
};

module.exports = { getNotifications, markRead, markOneRead };
