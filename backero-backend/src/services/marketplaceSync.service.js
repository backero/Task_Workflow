const axios = require('axios');
const MarketflowSnapshot = require('../models/MarketflowSnapshot');
const logger = require('../utils/logger');

const PLATFORMS = ['amazon', 'meesho', 'snapdeal', 'flipkart'];
const SYNC_INTERVAL_HOURS = 4;
const SYNC_TIMEOUT_MS = 30000;

class MarketplaceSyncService {
  /**
   * Sync all platform data from their respective sources.
   * Called by cron job every 4 hours.
   */
  async syncAllPlatforms() {
    const startTime = new Date();
    logger.info(`[Marketplace Sync] Starting 4-hour sync cycle at ${startTime.toISOString()}`);

    const results = {};

    for (const platform of PLATFORMS) {
      try {
        results[platform] = await this.syncPlatform(platform);
      } catch (error) {
        logger.error(`[Marketplace Sync] Failed to sync ${platform}:`, error.message);
        results[platform] = {
          status: 'failed',
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    }

    const duration = new Date() - startTime;
    logger.info(`[Marketplace Sync] Sync cycle completed in ${duration}ms`, results);
    return results;
  }

  /**
   * Sync a single platform's data.
   */
  async syncPlatform(platform) {
    const syncStart = new Date();

    try {
      let data;

      if (platform === 'amazon') {
        data = await this.fetchAmazonData();
      } else if (['meesho', 'snapdeal', 'flipkart'].includes(platform)) {
        // Python services already sync to MongoDB on their own schedule.
        // This just validates the data exists and is recent.
        const existing = await MarketflowSnapshot.findOne({ platform, endpoint: 'overview' }).lean();
        if (!existing) {
          throw new Error(`No synced data found for ${platform}`);
        }
        // Data is already in DB from Python service, no refetch needed
        return {
          status: 'ok',
          platform,
          method: 'python_service',
          syncedAt: existing.syncedAt,
          duration: new Date() - syncStart,
        };
      }

      // Save to MongoDB
      await MarketflowSnapshot.updateOne(
        { platform, endpoint: 'overview' },
        {
          platform,
          endpoint: 'overview',
          data,
          syncedAt: new Date(),
        },
        { upsert: true }
      );

      logger.info(`[Marketplace Sync] Successfully synced ${platform}`);
      return {
        status: 'ok',
        platform,
        method: platform === 'amazon' ? 'amazon_server' : 'python_service',
        syncedAt: new Date(),
        duration: new Date() - syncStart,
      };
    } catch (error) {
      logger.error(`[Marketplace Sync] Error syncing ${platform}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch Amazon data from the amazon-server.
   */
  async fetchAmazonData() {
    try {
      const response = await axios.get('http://127.0.0.1:4000/v1/dashboard/unified', {
        timeout: SYNC_TIMEOUT_MS,
      });

      if (!response.data) {
        throw new Error('Empty response from amazon-server');
      }

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Amazon server not running (127.0.0.1:4000)');
      }
      throw error;
    }
  }

  /**
   * Get the last synced data for a platform, with stale flag.
   * Used by the API to return data with sync metadata.
   */
  async getSnapshotWithMetadata(platform) {
    const snapshot = await MarketflowSnapshot.findOne({ platform, endpoint: 'overview' }).lean();

    if (!snapshot) {
      return {
        data: null,
        syncedAt: null,
        isStale: true,
        error: `No synced data found for ${platform}`,
      };
    }

    const now = new Date();
    const timeSinceSyncMs = now - new Date(snapshot.syncedAt);
    const timeSinceSyncHours = timeSinceSyncMs / (1000 * 60 * 60);
    const isStale = timeSinceSyncHours > SYNC_INTERVAL_HOURS + 1; // Allow 1 hour grace period

    return {
      data: snapshot.data,
      syncedAt: snapshot.syncedAt,
      isStale,
      timeSinceSyncHours: parseFloat(timeSinceSyncHours.toFixed(2)),
    };
  }

  /**
   * Manually trigger a sync (for testing/admin endpoints).
   */
  async manualSync(platform) {
    if (platform === 'all') {
      return this.syncAllPlatforms();
    }
    if (!PLATFORMS.includes(platform)) {
      throw new Error(`Unknown platform: ${platform}`);
    }
    return this.syncPlatform(platform);
  }
}

module.exports = new MarketplaceSyncService();
