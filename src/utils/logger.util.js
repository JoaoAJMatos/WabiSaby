/**
 * Logger Utility
 * Configures and exports the logger instance with web dashboard integration
 * Supports structured logging, child loggers, and context management
 */

const pino = require('pino');
const config = require('../config');
const { getFileLoggerStreams, setupRotation } = require('./file-logger.util');

// Logs service reference (set lazily to avoid circular dependency)
let logsService = null;

/**
 * Get the logs service (lazy load to avoid circular dependency)
 */
function getLogsService() {
    if (!logsService) {
        try {
            logsService = require('../services/system/logs.service').logsService;
        } catch (e) {
            // Service not available yet
        }
    }
    return logsService;
}

/**
 * Extract context and message from logger arguments
 * Supports both old format (string, ...args) and new format (context, message)
 */
function parseLoggerArgs(args) {
    let context = {};
    let message = '';
    let source = null;

    // Check if first arg is an object (structured logging)
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null && !(args[0] instanceof Error)) {
        const firstArg = args[0];
        
        // Extract context fields
        if (firstArg.component) context.component = firstArg.component;
        if (firstArg.context) context = { ...context, ...firstArg.context };
        if (firstArg.source) source = firstArg.source;
        if (firstArg.commandId) context.commandId = firstArg.commandId;
        if (firstArg.requestId) context.requestId = firstArg.requestId;
        if (firstArg.userId) context.userId = firstArg.userId;
        if (firstArg.groupId) context.groupId = firstArg.groupId;
        
        // Merge any other properties as context
        Object.keys(firstArg).forEach(key => {
            if (!['component', 'context', 'source', 'commandId', 'requestId', 'userId', 'groupId'].includes(key)) {
                if (!context.context) context.context = {};
                context.context[key] = firstArg[key];
            }
        });

        // Message is second arg or first arg's msg property
        if (args.length > 1 && typeof args[1] === 'string') {
            message = args[1];
            // Process remaining args
            for (let i = 2; i < args.length; i++) {
                if (args[i] instanceof Error) {
                    context.error = {
                        message: args[i].message,
                        stack: args[i].stack,
                        name: args[i].name
                    };
                } else if (typeof args[i] === 'object') {
                    context = { ...context, ...args[i] };
                } else {
                    message += ' ' + String(args[i]);
                }
            }
        } else if (firstArg.msg) {
            message = firstArg.msg;
        } else {
            // No explicit message, format the object
            message = JSON.stringify(firstArg, null, 2);
        }
    } else {
        // Old format: string message + optional args
        message = args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                if (arg instanceof Error) {
                    context.error = {
                        message: arg.message,
                        stack: arg.stack,
                        name: arg.name
                    };
                    return arg.message;
                } else {
                    // Merge object into context
                    context = { ...context, ...arg };
                    return '';
                }
            }
            return String(arg);
        }).filter(Boolean).join(' ');
    }

    return { context, message: message.trim(), source };
}

/**
 * Create enhanced logger wrapper that supports structured logging
 */
function createLoggerWrapper(baseLogger) {
    const wrapper = {
        // Create child logger with persistent context
        child: (bindings) => {
            const childLogger = baseLogger.child(bindings);
            return createLoggerWrapper(childLogger);
        },

        // Create logger with temporary context (for single log call)
        withContext: (context) => {
            return createLoggerWrapper(baseLogger.child(context));
        }
    };

    // Wrap logging methods
    const logMethods = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    
    logMethods.forEach(level => {
        wrapper[level] = function(...args) {
            // Call original pino method
            baseLogger[level].apply(baseLogger, args);
            
            // Also send to logs service for web dashboard
            const service = getLogsService();
            if (service) {
                const { context, message, source } = parseLoggerArgs(args);
                
                // Map pino levels to our levels
                const levelMap = {
                    trace: 'debug',
                    debug: 'debug',
                    info: 'info',
                    warn: 'warn',
                    error: 'error',
                    fatal: 'error'
                };

                // Format message with context for dashboard
                let formattedMessage = message;
                if (Object.keys(context).length > 0) {
                    try {
                        formattedMessage += '\n' + JSON.stringify(context, null, 2);
                    } catch {
                        formattedMessage += '\n[Context unavailable]';
                    }
                }

                service.addLogDirect(
                    levelMap[level] || 'info',
                    formattedMessage,
                    source || getCallerInfo()
                );
            }
        };
    });

    // Proxy to handle other pino methods
    return new Proxy(wrapper, {
        get(target, prop) {
            if (prop in target) {
                return target[prop];
            }
            // Delegate to base logger for other methods
            const value = baseLogger[prop];
            if (typeof value === 'function') {
                return value.bind(baseLogger);
            }
            return value;
        }
    });
}

/**
 * Get caller info from stack trace
 */
function getCallerInfo() {
    const stack = new Error().stack;
    if (!stack) return null;
    
    const lines = stack.split('\n');
    // Skip: Error, getCallerInfo, logger wrapper, actual caller
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip internal files and logger
        if (line.includes('logger.util.js') || 
            line.includes('node:internal') ||
            line.includes('node_modules')) {
            continue;
        }
        
        const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
        if (match) {
            const [, fn, file, lineNum] = match;
            const shortFile = file.split(/[/\\]/).slice(-2).join('/');
            return fn ? `${fn} (${shortFile}:${lineNum})` : `${shortFile}:${lineNum}`;
        }
    }
    return null;
}

// Create base pino logger with file logging support
const fileStreams = getFileLoggerStreams();
const allStreams = [];

// Console stream
if (config.logging.pretty) {
    allStreams.push({
        level: config.logging.level,
        stream: require('pino-pretty')({ colorize: true })
    });
} else {
    allStreams.push({
        level: config.logging.level,
        stream: process.stdout
    });
}

// Add file streams if enabled
allStreams.push(...fileStreams);

// Create logger with multistream if we have file logging, otherwise simple transport
let baseLogger;
if (fileStreams.length > 0) {
    baseLogger = pino({
        level: config.logging.level
    }, pino.multistream(allStreams));
    
    // Setup rotation if file logging is enabled
    setupRotation();
} else {
    baseLogger = pino({
        level: config.logging.level,
        transport: config.logging.pretty ? {
            target: 'pino-pretty'
        } : undefined
    });
}

// Create enhanced logger wrapper
const logger = createLoggerWrapper(baseLogger);

module.exports = { logger };
