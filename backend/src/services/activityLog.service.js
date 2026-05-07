const ActivityLog = require('../models/ActivityLog');
const logger = require('../utils/logger');

const log = async ({ userId, organizationId = null, action, entity = null, entityId = null, meta = {}, ipAddress = null }) => {
  try {
    await ActivityLog.create({ userId, organizationId, action, entity, entityId, meta, ipAddress });
  } catch (err) {
    // Never let logging failures crash the app
    logger.error(`ActivityLog write failed: ${err.message}`);
  }
};

module.exports = { log };
