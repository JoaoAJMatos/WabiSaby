/**
 * Default Configuration Values
 * Centralized default settings for all configuration sections
 */

class DefaultsConfig {
    constructor() {
        this.isDevMode = process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true';
        const loggingDefaults = this.isDevMode
            ? { 
                level: 'debug', 
                pretty: true,
                file: {
                    enabled: true,
                    path: './storage/logs',
                    rotation: {
                        strategy: 'daily',
                        maxSize: '10MB',
                        maxFiles: 30
                    },
                    levels: ['error', 'warn', 'info', 'debug']
                }
            }
            : { 
                level: 'info', 
                pretty: true,
                file: {
                    enabled: true,
                    path: './storage/logs',
                    rotation: {
                        strategy: 'daily',
                        maxSize: '10MB',
                        maxFiles: 30
                    },
                    levels: ['error', 'warn', 'info']
                }
            };

        const wppBrowserName = this.isDevMode ? 'WabiSaby-Dev' : 'WabiSaby';

        this.defaults = {
            server: {
                port: 3000,
                host: 'localhost',
            },
            whatsapp: {
                browserName: wppBrowserName,
                browserVersion: '1.0.0',
            },
            download: {
                audioFormat: 'mp3',
                audioQuality: '128k',
                downloadThumbnails: true,
                thumbnailFormat: 'jpg',
                playerClient: 'android',
                maxFilenameLength: 50,
            },
            playback: {
                cleanupAfterPlay: true,
                cleanupOnStartup: false,
                songTransitionDelay: 100,
                confirmSkip: true,
                showRequesterName: true,
                shuffleEnabled: false,
                repeatMode: 'off',
            },
            logging: loggingDefaults,
            performance: {
                prefetchNext: true,
                prefetchCount: 0,
            },
            notifications: {
                enabled: true,
                notifyAtPosition: 1,
            },
            privacy: {
                demoMode: false,
            },
            countdown: {
                enabled: false,
                targetDate: null, // ISO 8601 format: "2025-12-31T23:59:59"
                showInPlayer: true,
                showThreshold: 30, // seconds - show countdown when X seconds remaining
                message: 'Happy New Year! 🎉', // Message to display at countdown zero
                song: {
                    url: null, // YouTube/Spotify URL or search query
                    timestamp: 0, // seconds - where in song to be at countdown zero
                },
                skipBuffer: 5000, // milliseconds - buffer before start time (internal, not user-facing)
            },
        };
    }

    /**
     * Get default settings
     * @returns {Object} Default configuration values
     */
    getDefaultSettings() {
        return { ...this.defaults };
    }

    /**
     * Get default value for a specific section
     * @param {string} section - Configuration section name
     * @returns {Object} Default values for the section
     */
    getSectionDefaults(section) {
        return this.defaults[section] || {};
    }
}

module.exports = new DefaultsConfig();
