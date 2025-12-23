require('dotenv').config();
const { logger } = require('../utils/logger.util');
const { initializeDatabase } = require('../database');
const config = require('../config');
const { startServer } = require('../api/server');
const systemCoordinator = require('../core/coordinator');
const { initializeErrorHandlers } = require('../error');

(async () => {
    try {
        logger.info('Initializing database...');
        await initializeDatabase();

        // Load queue after database is initialized
        const queueManager = require('../core/queue');
        queueManager.loadQueue();

        config.loadSettings();
        config.cleanupTempFiles();

        // Validate currentSong after cleanup (cleanup may have deleted the file)
        const playbackController = require('../core/playback.controller');
        playbackController.validateCurrentSong();

        initializeErrorHandlers();

        logger.info('Initializing WabiSaby...');
        logger.info(`Server will run at http://${config.server.host}:${config.server.port}`);

        startServer(async (url) => {
            // Skip auto-opening browser in dev mode
            if (config.isDevelopment()) {
                logger.info('Dev mode: Skipping browser auto-open');
                return;
            }
            
            try {
                const { default: open } = await import('open');
                await open(url);
            } catch (err) {
                logger.warn(`Failed to open browser automatically: ${err.message}`);
            }
        });

        // Initialize system via coordinator
        systemCoordinator.initialize().catch(err => {
            logger.error('Failed to initialize system:', err);
            process.exit(1);
        });

        // Set up periodic cleanup job for rate limit records
        const dbService = require('../database/db.service');
        const rateLimitService = require('../services/rate-limit.service');
        
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

        logger.info('WabiSaby is running...');
    } catch (error) {
        logger.error('Failed to start application:', error);
        process.exit(1);
    }
})();

