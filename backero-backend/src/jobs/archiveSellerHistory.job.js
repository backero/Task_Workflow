const cron = require('node-cron');
const { archiveAllSellerMirrors } = require('../services/sellerHistory.service');
const logger = require('../utils/logger');

let historySchedule = null;

async function runArchive() {
  try {
    const results = await archiveAllSellerMirrors();
    logger.info('[Seller history] Archived current mirror readings', results);
    return results;
  } catch (error) {
    logger.error('[Seller history] Archive failed:', error.message);
    throw error;
  }
}

function initSellerHistoryJob() {
  if (historySchedule) return;
  historySchedule = cron.schedule('15 0,4,8,12,16,20 * * *', () => { runArchive().catch(() => {}); });
  runArchive().catch(() => {});
  logger.info('[Seller history] Initialized - archives every 4 hours after marketplace sync');
}

module.exports = { initSellerHistoryJob, runArchive };
