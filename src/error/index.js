const { logger } = require('../utils/logger.util');
const { isRateLimitError } = require('../utils/rate-limit.util');

/**
 * Error Handler Package
 * Sets up global error handlers for unhandled rejections and uncaught exceptions
 */

/**
 * Initialize global error handlers
 * This should be called once at application startup
 */
function initializeErrorHandlers() {
    process.on('unhandledRejection', (reason, promise) => {
        if (isRateLimitError(reason)) {
            const errorMsg = reason?.message || String(reason);
            logger.warn(`[Unhandled Rejection] Rate limit error caught: ${errorMsg}`);
            logger.warn('This is likely from YouTube API rate limiting. The operation will retry later.');
            return;
        }
        
        const errorMsg = reason?.message || String(reason);
        logger.error('[Unhandled Rejection]', errorMsg);
        logger.error('Promise:', promise);
    });

    process.on('uncaughtException', (error) => {
        if (isRateLimitError(error)) {
            const errorMsg = error?.message || String(error);
            logger.warn(`[Uncaught Exception] Rate limit error caught: ${errorMsg}`);
            logger.warn('This is likely from YouTube API rate limiting. The operation will retry later.');
            return;
        }
        
        logger.error('[Uncaught Exception]', error?.message || String(error));
        logger.error('Stack:', error?.stack);
    });
}

module.exports = {
    initializeErrorHandlers
};

