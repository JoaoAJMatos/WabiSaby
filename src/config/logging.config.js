/**
 * Logging Configuration
 * Manages logging-related settings
 */

class LoggingConfig {
    constructor() {
        // Default logging configuration
        this.defaults = {
            level: 'info',
            pretty: true,
            file: {
                enabled: true,
                path: './storage/logs',
                rotation: {
                    strategy: 'daily', // 'daily' or 'size'
                    maxSize: '10MB', // if size-based
                    maxFiles: 30 // days or files to keep
                },
                levels: ['error', 'warn', 'info'] // which levels to write to file
            }
        };
    }

    /**
     * Get logging configuration
     * @param {boolean} isDevMode - Whether running in development mode
     * @returns {Object} Logging configuration
     */
    getConfig(isDevMode) {
        const config = { ...this.defaults };
        
        // In dev mode, always use debug logging
        if (isDevMode) {
            config.level = 'debug';
            config.pretty = true;
            // In dev mode, also log debug to file
            config.file.levels = ['error', 'warn', 'info', 'debug'];
        }

        return config;
    }
}

module.exports = new LoggingConfig();
