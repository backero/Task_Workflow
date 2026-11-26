const MarketplaceSellerSnapshot = require('../models/MarketplaceSellerSnapshot');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { createNotification } = require('./notification.service');
const { ROLES } = require('../utils/constants');

const PLATFORMS = ['amazon', 'flipkart', 'meesho', 'snapdeal'];
const todayInIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

async function alertMissingMarketplaceCaptures(io) {
  const today = todayInIst();
  const organizationIds = await MarketplaceSellerSnapshot.distinct('organizationId');
  for (const organizationId of organizationIds) {
    const found = await MarketplaceSellerSnapshot.distinct('platform', { organizationId, date: today });
    const missing = PLATFORMS.filter((platform) => !found.includes(platform));
    if (!missing.length) continue;
    const alreadyAlerted = await Notification.exists({ organizationId, 'metadata.kind': 'marketplace_capture_missing', 'metadata.date': today });
    if (alreadyAlerted) continue;
    const admins = await User.find({ organizationId, isActive: true, role: { $in: [ROLES.ADMIN, ROLES.FOUNDER, ROLES.CHAIRMAN, ROLES.SUPER_ADMIN] } }).select('_id');
    await Promise.all(admins.map((admin) => createNotification({
      organizationId, recipient: admin._id, type: 'system', priority: 'high',
      title: 'Marketplace daily capture needs attention',
      message: `No real ${missing.join(', ')} capture was saved for ${today}. Sign in or restore the affected seller session.`,
      actionUrl: '/marketplace/trends', channels: { inApp: true },
      metadata: { kind: 'marketplace_capture_missing', date: today, missing },
    }, io)));
  }
}

module.exports = { alertMissingMarketplaceCaptures };
