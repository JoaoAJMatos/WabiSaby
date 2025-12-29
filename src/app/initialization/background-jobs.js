/**
 * Background Jobs Initialization
 * 
 * Sets up periodic background tasks
 */

const { logger } = require('../../utils/logger.util');
const dbService = require('../../infrastructure/database/db.service');
const rateLimitService = require('../../services/user/command-rate-limit.service');
const countdownService = require('../../services/countdown/countdown.service');

/**
 * Set up background jobs
 */
function setupBackgroundJobs() {
    logger.info('Setting up background jobs...');
    
    // Clean up old rate limit records every hour
    const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
    setInterval(() => {
        try {
            const config = rateLimitService.getRateLimitConfig();
            // Clean up records older than 2x the window (to be safe)
            const cleanupBefore = Math.floor(Date.now() / 1000) - (config.windowSeconds * 2);
            const deleted = dbService.cleanupOldRateLimitRequests(cleanupBefore);
            if (deleted > 0) {
                logger.debug(`Cleaned up ${deleted} old rate limit records`);
            }
        } catch (error) {
            logger.error('Error during rate limit cleanup:', error);
        }
    }, CLEANUP_INTERVAL_MS);
    
    // Run initial cleanup after 5 minutes (to avoid startup overhead)
    setTimeout(() => {
        try {
            const config = rateLimitService.getRateLimitConfig();
            const cleanupBefore = Math.floor(Date.now() / 1000) - (config.windowSeconds * 2);
            const deleted = dbService.cleanupOldRateLimitRequests(cleanupBefore);
            if (deleted > 0) {
                logger.debug(`Initial cleanup: removed ${deleted} old rate limit records`);
            }
        } catch (error) {
            logger.error('Error during initial rate limit cleanup:', error);
        }
    }, 5 * 60 * 1000); // 5 minutes

    // Start countdown checking (runs every second when enabled)
    countdownService.startChecking();

    logger.info('Background jobs set up');
}

module.exports = {
    setupBackgroundJobs
};

