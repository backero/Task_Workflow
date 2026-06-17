const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');

const createNotification = async (data, io) => {
  try {
    const notification = await Notification.create({
      organizationId: data.organizationId,
      recipient: data.recipient,
      title: data.title,
      message: data.message,
      type: data.type,
      priority: data.priority || 'medium',
      actionUrl: data.actionUrl,
      reference: data.reference,
      channels: {
        inApp: data.channels?.inApp ?? true,
        whatsapp: data.channels?.whatsapp ?? false,
        email: data.channels?.email ?? false,
      },
      metadata: data.metadata,
      createdBy: data.createdBy,
    });

    // Emit real-time notification
    if (io && data.channels?.inApp) {
      io.to(`user:${data.recipient}`).emit('notification', {
        _id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        priority: notification.priority,
        actionUrl: notification.actionUrl,
        createdAt: notification.createdAt,
      });
    }

    // Send WhatsApp if needed
    if (data.channels?.whatsapp) {
      const recipient = await User.findById(data.recipient).select('phone whatsapp');
      const phone = recipient?.whatsapp || recipient?.phone;
      if (phone) {
        sendWhatsAppNotification(phone, data.title, data.message, data.actionUrl).catch(logger.error);
      }
    }

    return notification;
  } catch (error) {
    logger.error('Failed to create notification:', error);
    return null;
  }
};

const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'https://backero-worktaskflow.vercel.app';

const sendWhatsAppNotification = async (phone, title, message, actionUrl) => {
  try {
    const { sendMessage } = require('./whatsapp.service');
    const link = actionUrl ? `${APP_URL}${actionUrl}` : APP_URL;
    const text = `*🔔 Backero Alert*\n\n*${title}*\n\n${message}\n\n🔗 *Open App:* ${link}\n\n_Backero Enterprise Platform_`;
    await sendMessage(phone, text);
  } catch (error) {
    logger.error(`WhatsApp notification failed: ${error.message}`);
  }
};

const markAsRead = async (notificationId, userId) => {
  return Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { isRead: true, readAt: new Date() },
    { new: true }
  );
};

const markAllAsRead = async (organizationId, userId) => {
  return Notification.updateMany(
    { organizationId, recipient: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
};

const getUnreadCount = async (organizationId, userId) => {
  return Notification.countDocuments({ organizationId, recipient: userId, isRead: false });
};

const bulkCreateNotifications = async (recipients, baseData, io) => {
  const promises = recipients.map((recipientId) =>
    createNotification({ ...baseData, recipient: recipientId }, io)
  );
  return Promise.allSettled(promises);
};

module.exports = { createNotification, sendWhatsAppNotification, markAsRead, markAllAsRead, getUnreadCount, bulkCreateNotifications };
