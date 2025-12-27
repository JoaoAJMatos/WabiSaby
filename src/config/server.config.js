/**
 * Server Configuration
 * Manages server-related settings (port, host)
 */

class ServerConfig {
    constructor() {
        // Default server configuration
        this.defaults = {
            port: 3000,
            host: 'localhost',
        };
    }

    /**
     * Get server configuration
     * Handles environment variables and defaults
     * @returns {Object} Server configuration
     */
    getConfig() {
        return {
            port: process.env.PORT ? parseInt(process.env.PORT, 10) : this.defaults.port,
            host: process.env.HOST || this.defaults.host,
        };
    }

    /**
     * Validate server configuration
     * @param {Object} config - Server configuration to validate
     * @returns {Array} Array of validation warnings
     */
    validate(config) {
        const warnings = [];

        // Validate port
        if (config.port < 1 || config.port > 65535) {
            warnings.push(`Invalid port number: ${config.port}. Using default: ${this.defaults.port}`);
        }

        return warnings;
    }

    /**
     * Get server URL
     * @param {Object} config - Server configuration
     * @returns {string} Server URL
     */
    getUrl(config) {
        return `http://${config.host}:${config.port}`;
    }
}

module.exports = new ServerConfig();
