const router = require('express').Router();
const Notification = require('../models/Notification');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { asyncHandler, sendSuccess, paginate, paginateResponse } = require('../utils/helpers');
const { markAsRead, markAllAsRead, getUnreadCount } = require('../services/notification.service');

router.use(authenticate, orgIsolation);

router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 30, type, priority, isRead } = req.query;
  const { skip } = paginate(page, limit);
  const filter = { organizationId: req.user.organizationId, recipient: req.user._id };
  if (type) filter.type = type;
  if (priority) filter.priority = priority;
  if (isRead !== undefined) filter.isRead = isRead === 'true';

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Notification.countDocuments(filter),
    getUnreadCount(req.user.organizationId, req.user._id),
  ]);

  sendSuccess(res, { ...paginateResponse(notifications, total, page, limit), unreadCount });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const notification = await markAsRead(req.params.id, req.user._id);
  sendSuccess(res, { notification });
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  await markAllAsRead(req.user.organizationId, req.user._id);
  sendSuccess(res, {}, 'All notifications marked as read');
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const count = await getUnreadCount(req.user.organizationId, req.user._id);
  sendSuccess(res, { count });
}));

module.exports = router;
