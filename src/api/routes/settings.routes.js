const express = require('express');
const config = require('../../config');
const { logger } = require('../../utils/logger.util');
const { getDiskUsage } = require('../../utils/helpers.util');

const router = express.Router();

/**
 * Settings that can be changed at runtime via the web UI
 * These don't require a restart and aren't sensitive
 */
const EDITABLE_SETTINGS = {
    download: ['audioFormat', 'audioQuality', 'downloadThumbnails', 'playerClient'],
    playback: ['cleanupAfterPlay', 'songTransitionDelay', 'confirmSkip', 'showRequesterName'],
    performance: ['prefetchNext', 'prefetchCount'],
    notifications: ['enabled', 'notifyAtPosition']
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
 * GET /api/settings
 * Get current configuration (only editable settings)
 */
router.get('/settings', (req, res) => {
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
            showRequesterName: config.playback.showRequesterName
        },
        performance: {
            prefetchNext: config.performance.prefetchNext,
            prefetchCount: config.performance.prefetchCount
        },
        notifications: {
            enabled: config.notifications.enabled,
            notifyAtPosition: config.notifications.notifyAtPosition
        }
    };

    res.json({
        success: true,
        settings,
        options: VALID_OPTIONS
    });
});

/**
 * POST /api/settings
 * Update configuration settings
 */
router.post('/settings', (req, res) => {
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
    if (['downloadThumbnails', 'cleanupAfterPlay', 'prefetchNext', 'enabled', 'confirmSkip', 'showRequesterName'].includes(key)) {
        if (typeof value !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: `${key} must be a boolean`
            });
        }
    }
    
    // Integer fields
    if (['songTransitionDelay', 'prefetchCount', 'notifyAtPosition'].includes(key)) {
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
    }

    // Update the config
    try {
        config[category][key] = parsedValue;
        
        // Persist settings to disk
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
});

/**
 * POST /api/settings/bulk
 * Update multiple settings at once
 */
router.post('/settings/bulk', (req, res) => {
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
            if (['songTransitionDelay', 'prefetchCount', 'notifyAtPosition'].includes(key)) {
                parsedValue = parseInt(value, 10);
                if (isNaN(parsedValue)) {
                    errors.push(`${key} must be a number`);
                    continue;
                }
            }

            config[category][key] = parsedValue;
            updated.push(`${category}.${key}`);
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
});

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
        showRequesterName: true
    },
    performance: {
        prefetchNext: true,
        prefetchCount: 0
    },
    notifications: {
        enabled: true,
        notifyAtPosition: 1
    }
};

/**
 * POST /api/settings/reset
 * Reset all settings to their default values
 */
router.post('/settings/reset', (req, res) => {
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
});

/**
 * GET /api/settings/disk-usage
 * Get disk usage information for WabiSaby storage directories
 */
router.get('/settings/disk-usage', (req, res) => {
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
});

module.exports = { router };

