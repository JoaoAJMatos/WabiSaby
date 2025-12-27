const { logger } = require('../../utils/logger.util');

/**
 * Error Handling Middleware
 * Centralized error handling and response formatting
 */

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
    // Log the error
    logger.error('API Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';

    // Handle different types of errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation failed',
            details: err.message
        });
    }

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            error: 'Authentication required'
        });
    }

    if (err.name === 'ForbiddenError') {
        return res.status(403).json({
            error: 'Access denied'
        });
    }

    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            error: 'Invalid CSRF token'
        });
    }

    // Database errors
    if (err.code && err.code.startsWith('SQLITE_')) {
        return res.status(500).json({
            error: 'Database error',
            ...(isDevelopment && { details: err.message })
        });
    }

    // Default error response
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal server error';

    res.status(statusCode).json({
        error: message,
        ...(isDevelopment && {
            stack: err.stack,
            details: err
        })
    });
}

/**
 * 404 handler for undefined routes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
}

/**
 * Wrap async route handlers to catch rejected promises
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Create a custom error with status code
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @returns {Error} Custom error object
 */
function createError(message, statusCode = 500) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

/**
 * Handle rate limit exceeded
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function rateLimitHandler(req, res, next) {
    res.status(429).json({
        error: 'Too many requests',
        retryAfter: res.get('Retry-After') || 60
    });
}

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler,
    createError,
    rateLimitHandler
};
