/**
 * File Logger Utility
 * Handles file-based logging with rotation
 */

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const config = require('../config');

let fileLogger = null;
let logStreams = [];

/**
 * Parse size string (e.g., "10MB") to bytes
 */
function parseSize(sizeStr) {
    const units = {
        'B': 1,
        'KB': 1024,
        'MB': 1024 * 1024,
        'GB': 1024 * 1024 * 1024
    };
    
    const match = sizeStr.match(/^(\d+)([KMGT]?B)$/i);
    if (!match) return 10 * 1024 * 1024; // Default 10MB
    
    const [, size, unit] = match;
    return parseInt(size) * (units[unit.toUpperCase()] || 1);
}

/**
 * Get log file path for a specific date
 */
function getLogFilePath(basePath, level, date = null) {
    const dateStr = date || new Date().toISOString().split('T')[0];
    const fileName = level === 'combined' ? `app-${dateStr}.log` : `${level}-${dateStr}.log`;
    return path.join(basePath, fileName);
}

/**
 * Rotate log files based on strategy
 */
function rotateLogs(basePath, rotationConfig) {
    if (rotationConfig.strategy !== 'daily') {
        // Size-based rotation handled by pino-file or manual checks
        return;
    }

    // Daily rotation: files are already date-based, just clean up old ones
    const maxAge = rotationConfig.maxFiles * 24 * 60 * 60 * 1000; // Convert days to ms
    const now = Date.now();

    try {
        const files = fs.readdirSync(basePath);
        files.forEach(file => {
            const filePath = path.join(basePath, file);
            const stats = fs.statSync(filePath);
            const age = now - stats.mtimeMs;
            
            if (age > maxAge) {
                fs.unlinkSync(filePath);
            }
        });
    } catch (err) {
        // Directory might not exist yet or other error - ignore
    }
}

/**
 * Initialize file logging
 */
function initializeFileLogger() {
    if (!config.logging.file || !config.logging.file.enabled) {
        return null;
    }

    const fileConfig = config.logging.file;
    const logPath = path.resolve(fileConfig.path);
    
    // Ensure log directory exists
    if (!fs.existsSync(logPath)) {
        fs.mkdirSync(logPath, { recursive: true });
    }

    // Clean up old logs
    rotateLogs(logPath, fileConfig.rotation);

    // Create streams for each log level
    const streams = [];
    const levelsToLog = fileConfig.levels || ['error', 'warn', 'info'];
    
    // Create combined log file
    if (levelsToLog.length > 0) {
        const combinedPath = getLogFilePath(logPath, 'combined');
        streams.push({
            level: Math.min(...levelsToLog.map(l => pino.levels.values[l])),
            stream: fs.createWriteStream(combinedPath, { flags: 'a' })
        });
    }

    // Create error-only log file
    if (levelsToLog.includes('error')) {
        const errorPath = getLogFilePath(logPath, 'error');
        streams.push({
            level: pino.levels.values.error,
            stream: fs.createWriteStream(errorPath, { flags: 'a' })
        });
    }

    // Create multi-stream logger
    const fileLoggerInstance = pino({
        level: config.logging.level,
    }, pino.multistream(streams));

    logStreams = streams;
    
    return fileLoggerInstance;
}

/**
 * Get file logger streams (lazy initialization)
 */
function getFileLoggerStreams() {
    // Always return an array to avoid spread syntax errors
    if (!config.logging.file || !config.logging.file.enabled) {
        return [];
    }
    
    if (!fileLogger) {
        fileLogger = initializeFileLogger();
    }
    
    // Return the streams array (stored in logStreams)
    return logStreams || [];
}

/**
 * Rotate logs manually (called periodically)
 */
function performRotation() {
    if (!config.logging.file || !config.logging.file.enabled) {
        return;
    }

    const fileConfig = config.logging.file;
    const logPath = path.resolve(fileConfig.path);
    
    // Close existing streams
    logStreams.forEach(stream => {
        if (stream.stream && typeof stream.stream.end === 'function') {
            stream.stream.end();
        }
    });
    
    // Reinitialize
    fileLogger = null;
    logStreams = [];
    getFileLogger();
}

/**
 * Setup periodic rotation (daily at midnight)
 */
function setupRotation() {
    if (!config.logging.file || !config.logging.file.enabled) {
        return;
    }

    const fileConfig = config.logging.file;
    if (fileConfig.rotation.strategy !== 'daily') {
        return;
    }

    // Calculate milliseconds until next midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    // Schedule rotation at midnight
    setTimeout(() => {
        performRotation();
        // Then rotate daily
        setInterval(performRotation, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
}

module.exports = {
    getFileLoggerStreams,
    performRotation,
    setupRotation
};

