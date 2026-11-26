const cron = require('node-cron');
const { syncAllMarketplaceSheets } = require('../services/marketplaceSheet.service');
const { alertMissingMarketplaceCaptures } = require('../services/marketplaceHealth.service');
const logger = require('../utils/logger');
let schedule = null;

function initMarketplaceSheetJob() {
  if (schedule) return;
  // Runs after seller-history archiving; rows are one per platform/business day.
  schedule = cron.schedule('35 0,4,8,12,16,20 * * *', () => syncAllMarketplaceSheets().catch((error) => logger.error('[Marketplace Sheets] Job failed:', error.message)));
  cron.schedule('0 18 * * *', () => alertMissingMarketplaceCaptures().catch((error) => logger.error('[Marketplace Health] Alert job failed:', error.message)));
  syncAllMarketplaceSheets().catch((error) => logger.error('[Marketplace Sheets] Initial sync failed:', error.message));
  logger.info('[Marketplace Sheets] Initialized - syncs after seller history archive');
}
module.exports = { initMarketplaceSheetJob };
