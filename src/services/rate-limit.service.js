const { logger } = require('../utils/logger.util');
const dbService = require('../database/db.service');
const { checkPriority } = require('./priority.service');

/**
 * Rate Limit Service
 * Implements sliding window rate limiting for non-VIP users
 */

// Default rate limit configuration
const DEFAULT_CONFIG = {
    enabled: true,
    maxRequests: 3,
    windowSeconds: 60
};

/**
 * Get rate limit configuration from settings
 * @returns {Object} Rate limit configuration
 */
function getRateLimitConfig() {
    try {
        const enabled = dbService.getSetting('rateLimit.enabled');
        const maxRequests = dbService.getSetting('rateLimit.maxRequests');
        const windowSeconds = dbService.getSetting('rateLimit.windowSeconds');
        
        return {
            enabled: enabled !== null ? enabled : DEFAULT_CONFIG.enabled,
            maxRequests: maxRequests !== null ? maxRequests : DEFAULT_CONFIG.maxRequests,
            windowSeconds: windowSeconds !== null ? windowSeconds : DEFAULT_CONFIG.windowSeconds
        };
    } catch (error) {
        logger.error('Error getting rate limit config, using defaults:', error);
        return DEFAULT_CONFIG;
    }
}

/**
 * Set rate limit configuration
 * @param {Object} config - Rate limit configuration
 * @param {boolean} config.enabled - Whether rate limiting is enabled
 * @param {number} config.maxRequests - Maximum requests per window
 * @param {number} config.windowSeconds - Time window in seconds
 */
function setRateLimitConfig(config) {
    if (config.enabled !== undefined) {
        dbService.setSetting('rateLimit.enabled', config.enabled);
    }
    if (config.maxRequests !== undefined) {
        dbService.setSetting('rateLimit.maxRequests', config.maxRequests);
    }
    if (config.windowSeconds !== undefined) {
        dbService.setSetting('rateLimit.windowSeconds', config.windowSeconds);
    }
    logger.info('Rate limit configuration updated:', config);
}

/**
 * Check if user can make a request (rate limit check)
 * @param {string} userId - User ID (WhatsApp ID)
 * @param {string} command - Command type ('play' or 'playlist')
 * @returns {Object} Rate limit check result
 * @returns {boolean} result.allowed - Whether request is allowed
 * @returns {number} result.remaining - Remaining requests in current window
 * @returns {number} result.resetAt - Timestamp when rate limit resets
 */
function checkRateLimit(userId, command) {
    // VIP users bypass rate limiting
    if (checkPriority(userId)) {
        return {
            allowed: true,
            remaining: Infinity,
            resetAt: null
        };
    }
    
    // Get rate limit configuration
    const config = getRateLimitConfig();
    
    // If rate limiting is disabled, allow all requests
    if (!config.enabled) {
        return {
            allowed: true,
            remaining: Infinity,
            resetAt: null
        };
    }
    
    try {
        const now = Math.floor(Date.now() / 1000);
        const windowStart = now - config.windowSeconds;
        
        // Get recent requests for this user and command within the time window
        const recentRequests = dbService.getRecentRateLimitRequests(userId, command, windowStart);
        
        // Count requests in the current window
        const requestCount = recentRequests.length;
        
        // Check if user has exceeded the limit
        if (requestCount >= config.maxRequests) {
            // Find the oldest request to calculate reset time
            const oldestRequest = recentRequests[recentRequests.length - 1];
            const resetAt = oldestRequest.requested_at + config.windowSeconds;
            const waitSeconds = resetAt - now;
            
            return {
                allowed: false,
                remaining: 0,
                resetAt: resetAt,
                waitSeconds: waitSeconds
            };
        }
        
        // Calculate remaining requests
        const remaining = config.maxRequests - requestCount - 1;
        
        // Calculate reset time (when oldest request expires)
        let resetAt = now + config.windowSeconds;
        if (recentRequests.length > 0) {
            const oldestRequest = recentRequests[recentRequests.length - 1];
            resetAt = oldestRequest.requested_at + config.windowSeconds;
        }
        
        return {
            allowed: true,
            remaining: remaining,
            resetAt: resetAt
        };
    } catch (error) {
        logger.error('Error checking rate limit:', error);
        // On error, allow the request to avoid blocking legitimate users
        return {
            allowed: true,
            remaining: Infinity,
            resetAt: null
        };
    }
}

/**
 * Record a successful request
 * @param {string} userId - User ID (WhatsApp ID)
 * @param {string} command - Command type ('play' or 'playlist')
 */
function recordRequest(userId, command) {
    // Don't record VIP requests (they bypass rate limiting)
    if (checkPriority(userId)) {
        return;
    }
    
    try {
        dbService.addRateLimitRequest(userId, command);
        
        // Periodically clean up old records (every 100 requests to avoid overhead)
        // This is a simple approach - a dedicated cleanup job would be better
        if (Math.random() < 0.01) { // 1% chance
            const config = getRateLimitConfig();
            const cleanupBefore = Math.floor(Date.now() / 1000) - (config.windowSeconds * 2);
            dbService.cleanupOldRateLimitRequests(cleanupBefore);
        }
    } catch (error) {
        logger.error('Error recording rate limit request:', error);
    }
}

module.exports = {
    checkRateLimit,
    recordRequest,
    getRateLimitConfig,
    setRateLimitConfig
};

