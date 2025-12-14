const pino = require('pino');
const config = require('../config');

/**
 * Logger Utility
 * Configures and exports the logger instance with web dashboard integration
 */

// Create base pino logger
const baseLogger = pino({
    level: config.logging.level,
    transport: config.logging.pretty ? {
        target: 'pino-pretty'
    } : undefined
});

// Logs service reference (set lazily to avoid circular dependency)
let logsService = null;

/**
 * Get the logs service (lazy load to avoid circular dependency)
 */
function getLogsService() {
    if (!logsService) {
        try {
            logsService = require('../services/logs.service').logsService;
        } catch (e) {
            // Service not available yet
        }
    }
    return logsService;
}

/**
 * Create a wrapped logger that sends to both pino and web dashboard
 */
const logger = new Proxy(baseLogger, {
    get(target, prop) {
        const value = target[prop];
        
        // Only wrap logging methods
        const logMethods = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
        
        if (typeof value === 'function' && logMethods.includes(prop)) {
            return function(...args) {
                // Call original pino method
                value.apply(target, args);
                
                // Also send to logs service for web dashboard
                const service = getLogsService();
                if (service) {
                    // Map pino levels to our levels
                    const levelMap = {
                        trace: 'debug',
                        debug: 'debug',
                        info: 'info',
                        warn: 'warn',
                        error: 'error',
                        fatal: 'error'
                    };
                    
                    // Format the message
                    let message = '';
                    let source = 'logger';
                    
                    args.forEach(arg => {
                        if (typeof arg === 'object' && arg !== null) {
                            // Check for error objects
                            if (arg instanceof Error) {
                                message += arg.message + ' ';
                                if (arg.stack) {
                                    message += '\n' + arg.stack;
                                }
                            } else {
                                // Regular object - stringify it
                                try {
                                    message += JSON.stringify(arg, null, 2) + ' ';
                                } catch {
                                    message += String(arg) + ' ';
                                }
                            }
                        } else if (typeof arg === 'string') {
                            message += arg + ' ';
                        } else {
                            message += String(arg) + ' ';
                        }
                    });
                    
                    message = message.trim();
                    
                    // Send to logs service (without going through console to avoid loops)
                    service.addLogDirect(levelMap[prop] || 'info', message, source);
                }
            };
        }
        
        return value;
    }
});

module.exports = { logger };
