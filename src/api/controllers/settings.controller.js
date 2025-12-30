const config = require('../../config');
const { logger } = require('../../utils/logger.util');
const { getDiskUsage } = require('../../utils/helpers.util');
const rateLimitService = require('../../services/user/command-rate-limit.service');

/**
 * Settings Controller
 * Handles configuration settings management
 */

/**
 * Settings that can be changed at runtime via the web UI
 * These don't require a restart and aren't sensitive
 */
const EDITABLE_SETTINGS = {
    download: ['audioFormat', 'audioQuality', 'downloadThumbnails', 'playerClient'],
    playback: ['cleanupAfterPlay', 'songTransitionDelay', 'confirmSkip', 'showRequesterName', 'shuffleEnabled', 'repeatMode'],
    performance: ['prefetchNext', 'prefetchCount'],
    notifications: ['enabled', 'notifyAtPosition'],
    privacy: ['demoMode'],
    rateLimit: ['enabled', 'maxRequests', 'windowSeconds'],
    countdown: ['enabled', 'targetDate', 'showInPlayer', 'showThreshold', 'skipBuffer', 'message']
};

/**
 * Valid options for select fields
 */
const VALID_OPTIONS = {
    audioFormat: ['mp3', 'm4a', 'opus', 'flac', 'wav'],
    audioQuality: ['64k', '128k', '192k', '256k', '320k'],
    playerClient: ['android', 'web', 'ios']
};

/**
 * Default values for resettable settings
 */
const DEFAULT_SETTINGS = {
    download: {
        audioFormat: 'mp3',
        audioQuality: '128k',
        downloadThumbnails: true,
        playerClient: 'android'
    },
    playback: {
        cleanupAfterPlay: true,
        songTransitionDelay: 100,
        confirmSkip: true,
        showRequesterName: true,
        shuffleEnabled: false,
        repeatMode: 'off'
    },
    performance: {
        prefetchNext: true,
        prefetchCount: 0
    },
    notifications: {
        enabled: true,
        notifyAtPosition: 1
    },
    rateLimit: {
        enabled: true,
        maxRequests: 3,
        windowSeconds: 60
    },
    countdown: {
        enabled: false,
        targetDate: null,
        showInPlayer: true,
        showThreshold: 300,
        skipBuffer: 5000,
        message: 'Happy New Year! 🎉',
        song: {
            url: null,
            timestamp: 0
        }
    }
};

class SettingsController {
    /**
     * Get current configuration (only editable settings)
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getSettings(req, res) {
        config._ensureSettingsLoaded();
        
        const settings = {
            server: {
                port: config.server.port,
                host: config.server.host,
                // Indicate if these are set via environment variables
                portFromEnv: !!process.env.PORT,
                hostFromEnv: !!process.env.HOST
            },
            download: {
                audioFormat: config.download.audioFormat,
                audioQuality: config.download.audioQuality,
                downloadThumbnails: config.download.downloadThumbnails,
                playerClient: config.download.playerClient
            },
            playback: {
                cleanupAfterPlay: config.playback.cleanupAfterPlay,
                songTransitionDelay: config.playback.songTransitionDelay,
                confirmSkip: config.playback.confirmSkip,
                showRequesterName: config.playback.showRequesterName,
                shuffleEnabled: config.playback.shuffleEnabled,
                repeatMode: config.playback.repeatMode
            },
            performance: {
                prefetchNext: config.performance.prefetchNext,
                prefetchCount: config.performance.prefetchCount
            },
            notifications: {
                enabled: config.notifications.enabled,
                notifyAtPosition: config.notifications.notifyAtPosition
            },
            privacy: {
                demoMode: config.privacy?.demoMode || false
            },
            rateLimit: rateLimitService.getRateLimitConfig(),
            countdown: {
                enabled: config.countdown?.enabled || false,
                targetDate: config.countdown?.targetDate || null,
                showInPlayer: config.countdown?.showInPlayer !== false,
                showThreshold: config.countdown?.showThreshold || 300,
                skipBuffer: config.countdown?.skipBuffer || 5000,
                message: config.countdown?.message || 'Happy New Year! 🎉',
                song: {
                    url: config.countdown?.song?.url || null,
                    timestamp: config.countdown?.song?.timestamp || 0
                }
            }
        };

        res.json({
            success: true,
            settings,
            options: VALID_OPTIONS
        });
    }

    /**
     * Update configuration settings
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    updateSetting(req, res) {
        config._ensureSettingsLoaded();
        
        const { category, key, value } = req.body;

        // Validate category
        if (!EDITABLE_SETTINGS[category]) {
            return res.status(400).json({
                success: false,
                error: `Invalid category: ${category}`
            });
        }

        // Validate key is editable
        if (!EDITABLE_SETTINGS[category].includes(key)) {
            return res.status(400).json({
                success: false,
                error: `Setting '${key}' in category '${category}' cannot be modified`
            });
        }

        // Validate value for select fields
        if (VALID_OPTIONS[key] && !VALID_OPTIONS[key].includes(value)) {
            return res.status(400).json({
                success: false,
                error: `Invalid value for ${key}. Valid options: ${VALID_OPTIONS[key].join(', ')}`
            });
        }

        // Type validation
        let parsedValue = value;
        
        // Boolean fields
        if (['downloadThumbnails', 'cleanupAfterPlay', 'prefetchNext', 'enabled', 'confirmSkip', 'showRequesterName', 'demoMode', 'showInPlayer'].includes(key)) {
            if (typeof value !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: `${key} must be a boolean`
                });
            }
        }

        // String fields (for countdown targetDate)
        if (key === 'targetDate' && value !== null) {
            if (typeof value !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: `${key} must be a string (ISO 8601 date format) or null`
                });
            }
            // Validate date format
            const parsedDate = new Date(value);
            if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    error: `${key} must be a valid date in ISO 8601 format`
                });
            }
        }

        // Integer fields
        if (['songTransitionDelay', 'prefetchCount', 'notifyAtPosition', 'maxRequests', 'windowSeconds', 'showThreshold', 'skipBuffer'].includes(key)) {
            parsedValue = parseInt(value, 10);
            if (isNaN(parsedValue) || parsedValue < 0) {
                return res.status(400).json({
                    success: false,
                    error: `${key} must be a non-negative integer`
                });
            }
            
            // Additional validation
            if (key === 'notifyAtPosition' && parsedValue < 1) {
                parsedValue = 1;
            }
            if (key === 'songTransitionDelay' && parsedValue > 10000) {
                parsedValue = 10000; // Max 10 seconds
            }
            if (key === 'maxRequests' && parsedValue < 1) {
                return res.status(400).json({
                    success: false,
                    error: 'maxRequests must be at least 1'
                });
            }
            if (key === 'windowSeconds' && parsedValue < 10) {
                return res.status(400).json({
                    success: false,
                    error: 'windowSeconds must be at least 10'
                });
            }
        }

        // Update the config
        try {
            // Handle rate limit settings specially (they use dbService directly)
            if (category === 'rateLimit') {
                const currentConfig = rateLimitService.getRateLimitConfig();
                const newConfig = { ...currentConfig, [key]: parsedValue };
                rateLimitService.setRateLimitConfig(newConfig);
                
                logger.info(`Rate limit setting updated: ${category}.${key} = ${parsedValue}`);
                
                return res.json({
                    success: true,
                    message: `Updated ${category}.${key}`,
                    newValue: parsedValue
                });
            }
            
            // Ensure the category exists
            if (!config[category]) {
                logger.warn(`Category ${category} does not exist in config, initializing...`);
                config[category] = {};
            }
            
            config[category][key] = parsedValue;
            
            const saved = config.saveSettings();
            if (!saved) {
                logger.warn('Setting updated in memory but failed to persist to disk');
            }
            
            logger.info(`Settings updated: ${category}.${key} = ${parsedValue}`);
            
            res.json({
                success: true,
                message: `Updated ${category}.${key}`,
                newValue: parsedValue
            });
        } catch (error) {
            logger.error('Failed to update setting:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update setting'
            });
        }
    }

    /**
     * Update multiple settings at once
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    bulkUpdateSettings(req, res) {
        const { settings } = req.body;
        const updated = [];
        const errors = [];

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Settings object required'
            });
        }

        for (const [category, values] of Object.entries(settings)) {
            if (!EDITABLE_SETTINGS[category]) {
                errors.push(`Invalid category: ${category}`);
                continue;
            }

            for (const [key, value] of Object.entries(values)) {
                if (!EDITABLE_SETTINGS[category].includes(key)) {
                    errors.push(`Cannot modify ${category}.${key}`);
                    continue;
                }

                // Validate select options
                if (VALID_OPTIONS[key] && !VALID_OPTIONS[key].includes(value)) {
                    errors.push(`Invalid value for ${key}`);
                    continue;
                }

                // Parse and set value
                let parsedValue = value;
                if (['songTransitionDelay', 'prefetchCount', 'notifyAtPosition', 'maxRequests', 'windowSeconds'].includes(key)) {
                    parsedValue = parseInt(value, 10);
                    if (isNaN(parsedValue)) {
                        errors.push(`${key} must be a number`);
                        continue;
                    }
                    if (key === 'maxRequests' && parsedValue < 1) {
                        errors.push('maxRequests must be at least 1');
                        continue;
                    }
                    if (key === 'windowSeconds' && parsedValue < 10) {
                        errors.push('windowSeconds must be at least 10');
                        continue;
                    }
                }

                // Handle rate limit settings specially
                if (category === 'rateLimit') {
                    const currentConfig = rateLimitService.getRateLimitConfig();
                    const newConfig = { ...currentConfig, [key]: parsedValue };
                    rateLimitService.setRateLimitConfig(newConfig);
                    updated.push(`${category}.${key}`);
                } else {
                    config[category][key] = parsedValue;
                    updated.push(`${category}.${key}`);
                }
            }
        }

        // Persist settings to disk
        const saved = config.saveSettings();
        if (!saved) {
            logger.warn('Settings updated in memory but failed to persist to disk');
        }

        logger.info(`Bulk settings update: ${updated.length} settings changed`);

        res.json({
            success: errors.length === 0,
            updated,
            errors: errors.length > 0 ? errors : undefined
        });
    }

    /**
     * Reset all settings to their default values
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    resetSettings(req, res) {
        try {
            // Reset each category to defaults
            for (const [category, settings] of Object.entries(DEFAULT_SETTINGS)) {
                for (const [key, value] of Object.entries(settings)) {
                    config[category][key] = value;
                }
            }
            
            // Persist settings to disk
            const saved = config.saveSettings();
            if (!saved) {
                logger.warn('Settings reset in memory but failed to persist to disk');
            }
            
            logger.info('All settings reset to defaults');
            
            res.json({
                success: true,
                message: 'All settings reset to defaults',
                settings: DEFAULT_SETTINGS
            });
        } catch (error) {
            logger.error('Failed to reset settings:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to reset settings'
            });
        }
    }

    /**
     * Get disk usage information for WabiSaby storage directories
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getDiskUsage(req, res) {
        try {
            const usage = getDiskUsage();
            
            res.json({
                success: true,
                usage
            });
        } catch (error) {
            logger.error('Failed to get disk usage:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get disk usage information'
            });
        }
    }
}

module.exports = new SettingsController();

