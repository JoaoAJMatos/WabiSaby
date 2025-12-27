const { logger } = require('../../utils/logger.util');

/**
 * Rate Limiting Middleware
 * Provides API rate limiting functionality
 */

// In-memory rate limit store (in production, use Redis)
const rateLimitStore = new Map();

/**
 * Clean up expired rate limit entries
 */
function cleanupExpiredEntries() {
    const now = Math.floor(Date.now() / 1000);

    for (const [key, data] of rateLimitStore.entries()) {
        // Remove entries older than 2x the window
        if (now - data.lastRequest > data.windowSeconds * 2) {
            rateLimitStore.delete(key);
        }
    }
}

/**
 * Get client identifier for rate limiting
 * @param {Object} req - Express request object
 * @returns {string} Client identifier
 */
function getClientIdentifier(req) {
    // Use IP address as primary identifier
    const ip = req.ip ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               'unknown';

    // For authenticated requests, include user ID
    const userId = req.vip?.whatsappId || req.user?.id;

    return userId ? `${userId}_${ip}` : ip;
}

/**
 * Rate limiting middleware
 * @param {Object} options - Rate limiting options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxRequests - Maximum requests per window
 * @param {string} options.key - Rate limit key/category
 * @returns {Function} Express middleware function
 */
function rateLimit(options = {}) {
    const {
        windowMs = 60 * 1000, // 1 minute default
        maxRequests = 100, // 100 requests per window default
        key = 'default'
    } = options;

    const windowSeconds = Math.floor(windowMs / 1000);

    return (req, res, next) => {
        try {
            const clientId = getClientIdentifier(req);
            const rateLimitKey = `${key}_${clientId}`;
            const now = Math.floor(Date.now() / 1000);

            // Clean up expired entries periodically
            if (Math.random() < 0.01) { // 1% chance to cleanup
                cleanupExpiredEntries();
            }

            let clientData = rateLimitStore.get(rateLimitKey);

            if (!clientData) {
                // First request from this client
                clientData = {
                    requests: 0,
                    windowStart: now,
                    lastRequest: now,
                    windowSeconds
                };
                rateLimitStore.set(rateLimitKey, clientData);
            }

            // Check if we need to reset the window
            if (now - clientData.windowStart >= windowSeconds) {
                clientData.requests = 0;
                clientData.windowStart = now;
            }

            clientData.requests++;
            clientData.lastRequest = now;

            // Check rate limit
            if (clientData.requests > maxRequests) {
                const resetTime = clientData.windowStart + windowSeconds;
                const retryAfter = resetTime - now;

                // Set headers
                res.set({
                    'X-RateLimit-Limit': maxRequests,
                    'X-RateLimit-Remaining': Math.max(0, maxRequests - clientData.requests),
                    'X-RateLimit-Reset': resetTime,
                    'Retry-After': retryAfter
                });

                logger.warn(`Rate limit exceeded for ${clientId} (${key}): ${clientData.requests}/${maxRequests}`);

                // Use the rate limit handler from error middleware
                const { rateLimitHandler } = require('./error.middleware');
                return rateLimitHandler(req, res, next);
            }

            // Set rate limit headers
            res.set({
                'X-RateLimit-Limit': maxRequests,
                'X-RateLimit-Remaining': Math.max(0, maxRequests - clientData.requests + 1), // +1 because this request hasn't been counted yet in the header
                'X-RateLimit-Reset': clientData.windowStart + windowSeconds
            });

            next();
        } catch (error) {
            logger.error('Rate limiting error:', error);
            // Continue with request if rate limiting fails
            next();
        }
    };
}

/**
 * API rate limiting with in-memory tracking (for general API endpoints)
 * Uses in-memory store instead of database for better performance
 * @param {Object} options - Rate limiting options
 * @returns {Function} Express middleware function
 */
function apiRateLimit(options = {}) {
    const {
        windowMs = 60 * 1000,
        maxRequests = 100,
        key = 'api'
    } = options;

    const windowSeconds = Math.floor(windowMs / 1000);

    return (req, res, next) => {
        // Skip rate limiting for SSE endpoints (long-lived connections)
        if (req.path && req.path.endsWith('/stream')) {
            return next();
        }
        
        // Skip rate limiting for localhost connections (this is a localhost-only app)
        const forwardedFor = req.headers['x-forwarded-for'];
        const realIp = req.headers['x-real-ip'];
        const ip = realIp || 
                   (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ||
                   req.ip || 
                   req.connection?.remoteAddress || 
                   req.socket?.remoteAddress;
        
        const isLocalhost = ip === '127.0.0.1' || 
                           ip === '::1' || 
                           ip === '::ffff:127.0.0.1' ||
                           req.hostname === 'localhost' ||
                           req.hostname === '127.0.0.1' ||
                           !ip || ip === 'unknown';
        
        if (isLocalhost) {
            return next();
        }
        
        try {
            const clientId = getClientIdentifier(req);
            const rateLimitKey = `${key}_${clientId}`;
            const now = Math.floor(Date.now() / 1000);

            // Clean up expired entries periodically
            if (Math.random() < 0.01) { // 1% chance to cleanup
                cleanupExpiredEntries();
            }

            let clientData = rateLimitStore.get(rateLimitKey);

            if (!clientData) {
                // First request from this client
                clientData = {
                    requests: 0,
                    windowStart: now,
                    lastRequest: now,
                    windowSeconds
                };
                rateLimitStore.set(rateLimitKey, clientData);
            }

            // Check if we need to reset the window
            if (now - clientData.windowStart >= windowSeconds) {
                clientData.requests = 0;
                clientData.windowStart = now;
            }

            clientData.requests++;
            clientData.lastRequest = now;

            // Check rate limit
            if (clientData.requests > maxRequests) {
                const resetTime = clientData.windowStart + windowSeconds;
                const retryAfter = resetTime - now;

                // Set headers
                res.set({
                    'X-RateLimit-Limit': maxRequests,
                    'X-RateLimit-Remaining': Math.max(0, maxRequests - clientData.requests),
                    'X-RateLimit-Reset': resetTime,
                    'Retry-After': retryAfter
                });

                logger.warn(`API rate limit exceeded for ${clientId} (${key}): ${clientData.requests}/${maxRequests}`);

                // Use the rate limit handler from error middleware
                const { rateLimitHandler } = require('./error.middleware');
                return rateLimitHandler(req, res, next);
            }

            // Set rate limit headers
            res.set({
                'X-RateLimit-Limit': maxRequests,
                'X-RateLimit-Remaining': Math.max(0, maxRequests - clientData.requests + 1), // +1 because this request hasn't been counted yet in the header
                'X-RateLimit-Reset': clientData.windowStart + windowSeconds
            });

            next();
        } catch (error) {
            // Only log errors that aren't expected during startup (like database not ready)
            // Silently continue with request if rate limiting fails
            next();
        }
    };
}

module.exports = {
    rateLimit,
    apiRateLimit,
    getClientIdentifier,
    cleanupExpiredEntries
};
