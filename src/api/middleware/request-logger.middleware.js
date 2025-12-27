/**
 * Request Logger Middleware
 * Logs all API requests and responses with timing and context
 */

const { logger } = require('../../utils/logger.util');

/**
 * Generate a unique request ID
 */
function generateRequestId() {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitize sensitive data from request body
 */
function sanitizeBody(body) {
    if (!body || typeof body !== 'object') {
        return body;
    }
    
    const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'auth', 'authorization'];
    const sanitized = { ...body };
    
    sensitiveKeys.forEach(key => {
        if (sanitized[key]) {
            sanitized[key] = '[REDACTED]';
        }
    });
    
    return sanitized;
}

/**
 * Request logger middleware
 * Only logs important requests: POST/PUT/DELETE API calls, errors, and slow requests
 */
function requestLogger(req, res, next) {
    // Skip logging for static assets
    const staticAssetPatterns = [
        /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i,
        /^\/js\//,
        /^\/styles\//,
        /^\/locales\//,
        /^\/thumbnails\//,
        /^\/stream\//
    ];
    
    const isStaticAsset = staticAssetPatterns.some(pattern => pattern.test(req.path));
    const isApiRequest = req.path.startsWith('/api/');
    const isModifyingRequest = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
    
    // Skip static assets completely
    if (isStaticAsset) {
        return next();
    }
    
    // Only track API requests that modify data, or we'll log errors/slow requests
    const shouldTrack = isApiRequest && (isModifyingRequest || req.method === 'GET');
    
    const startTime = Date.now();
    let requestLogger = null;
    
    if (shouldTrack) {
        const requestId = generateRequestId();
        requestLogger = logger.child({
            component: 'api',
            context: {
                requestId,
                method: req.method,
                path: req.path,
                ip: req.ip || req.connection.remoteAddress
            }
        });
        
        // Only log modifying requests at debug level
        if (isModifyingRequest) {
            requestLogger.debug({
                context: {
                    event: 'request_received',
                    query: Object.keys(req.query).length > 0 ? req.query : undefined,
                    body: req.body && Object.keys(req.body).length > 0 ? sanitizeBody(req.body) : undefined
                }
            }, `${req.method} ${req.path}`);
        }
    }

    // Track response only if we're tracking this request
    if (shouldTrack) {
        const originalSend = res.send;
        res.send = function(body) {
            const duration = Date.now() - startTime;
            const isError = res.statusCode >= 400;
            const isSlow = duration > 1000;
            
            // Only log errors, slow requests, or modifying requests
            if (isError || isSlow || isModifyingRequest) {
                const level = res.statusCode >= 500 ? 'error' : 
                             res.statusCode >= 400 ? 'warn' : 'info';
                
                if (!requestLogger) {
                    // Create logger if we need to log an error/slow request we weren't tracking
                    const requestId = generateRequestId();
                    requestLogger = logger.child({
                        component: 'api',
                        context: {
                            requestId,
                            method: req.method,
                            path: req.path,
                            ip: req.ip || req.connection.remoteAddress
                        }
                    });
                }
                
                requestLogger[level]({
                    context: {
                        event: 'request_completed',
                        statusCode: res.statusCode,
                        duration,
                        ...(isApiRequest && {
                            responseSize: body ? Buffer.byteLength(JSON.stringify(body), 'utf8') : 0
                        })
                    }
                }, `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);

                // Log slow requests
                if (isSlow) {
                    requestLogger.warn({
                        context: {
                            event: 'slow_request',
                            duration,
                            threshold: 1000
                        }
                    }, `Slow request detected: ${req.method} ${req.path} took ${duration}ms`);
                }
            }

            originalSend.call(this, body);
        };
    }

    // Track errors (always log errors)
    res.on('error', (error) => {
        if (!requestLogger) {
            const requestId = generateRequestId();
            requestLogger = logger.child({
                component: 'api',
                context: {
                    requestId,
                    method: req.method,
                    path: req.path,
                    ip: req.ip || req.connection.remoteAddress
                }
            });
        }
        
        requestLogger.error({
            context: {
                event: 'request_error',
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                }
            }
        }, `Request error: ${req.method} ${req.path}`, error);
    });

    next();
}

module.exports = requestLogger;

