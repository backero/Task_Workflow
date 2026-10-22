const cron = require('node-cron');
const marketplaceSync = require('../services/marketplaceSync.service');
const logger = require('../utils/logger');

let syncSchedule = null;

/**
 * Initialize the marketplace data sync cron job.
 * Runs every 4 hours: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC
 */
function initSyncJob() {
  if (syncSchedule) {
    logger.warn('[Sync Job] Cron job already initialized, skipping');
    return;
  }

  // Run at 0, 4, 8, 12, 16, 20 UTC (every 4 hours)
  syncSchedule = cron.schedule('0 0,4,8,12,16,20 * * *', async () => {
    logger.info('[Sync Job] Triggered - marketplace data sync starting...');
    try {
      const results = await marketplaceSync.syncAllPlatforms();
      logger.info('[Sync Job] Completed successfully', results);
    } catch (error) {
      logger.error('[Sync Job] Failed with error:', error.message);
    }
  });

  logger.info('[Sync Job] Initialized - will run every 4 hours at 00, 04, 08, 12, 16, 20 UTC');
}

/**
 * Stop the cron job (for graceful shutdown).
 */
function stopSyncJob() {
  if (syncSchedule) {
    syncSchedule.stop();
    logger.info('[Sync Job] Stopped');
  }
}

/**
 * Manually trigger a sync immediately (for testing/manual triggers).
 */
async function triggerSync(platform = 'all') {
  logger.info(`[Sync Job] Manual trigger for ${platform}`);
  try {
    const result = await marketplaceSync.manualSync(platform);
    logger.info(`[Sync Job] Manual sync completed:`, result);
    return result;
  } catch (error) {
    logger.error(`[Sync Job] Manual sync failed:`, error.message);
    throw error;
  }
}

module.exports = {
  initSyncJob,
  stopSyncJob,
  triggerSync,
};
