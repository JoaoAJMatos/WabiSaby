const volumeNormalization = require('../../services/audio/volume-normalization.service');
const dbService = require('../../infrastructure/database/db.service');
const { logger } = require('../../utils/logger.util');

/**
 * Volume Normalization Controller
 * Manages volume normalization settings and analysis
 */

class VolumeNormalizationController {
    /**
     * Get current volume normalization settings
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getSettings(req, res) {
        try {
            const settings = volumeNormalization.getNormalizationSettings();
            res.json({ success: true, settings });
        } catch (err) {
            logger.error('Failed to get normalization settings:', err);
            res.status(500).json({ success: false, error: 'Failed to get settings' });
        }
    }

    /**
     * Update volume normalization settings
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    updateSettings(req, res) {
        try {
            const { enabled, thresholdTooLow, thresholdTooHigh, targetLevel } = req.body;
            
            const currentSettings = volumeNormalization.getNormalizationSettings();
            const newSettings = {
                enabled: enabled !== undefined ? enabled : currentSettings.enabled,
                thresholdTooLow: thresholdTooLow !== undefined ? thresholdTooLow : currentSettings.thresholdTooLow,
                thresholdTooHigh: thresholdTooHigh !== undefined ? thresholdTooHigh : currentSettings.thresholdTooHigh,
                targetLevel: targetLevel !== undefined ? targetLevel : currentSettings.targetLevel
            };
            
            // Validate ranges
            if (newSettings.thresholdTooLow >= newSettings.thresholdTooHigh) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid thresholds: tooLow must be less than tooHigh'
                });
            }
            
            // Validate that targetLevel is reasonable (between thresholds)
            if (newSettings.targetLevel < newSettings.thresholdTooLow ||
                newSettings.targetLevel > newSettings.thresholdTooHigh) {
                return res.status(400).json({
                    success: false,
                    error: 'Target level must be between tooLow and tooHigh thresholds'
                });
            }
            
            // Validate types
            if (typeof newSettings.enabled !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'enabled must be a boolean'
                });
            }
            
            const numericFields = ['thresholdTooLow', 'thresholdTooHigh', 'targetLevel'];
            for (const field of numericFields) {
                if (typeof newSettings[field] !== 'number' || isNaN(newSettings[field])) {
                    return res.status(400).json({
                        success: false,
                        error: `${field} must be a number`
                    });
                }
            }
            
            // Save to database (thresholdOk will be removed if it exists)
            dbService.setSetting('volumeNormalization', newSettings);
            
            logger.info('Volume normalization settings updated:', newSettings);
            res.json({ success: true, settings: newSettings });
        } catch (err) {
            logger.error('Failed to update normalization settings:', err);
            res.status(500).json({ success: false, error: 'Failed to update settings' });
        }
    }

    /**
     * Manually trigger volume analysis for an existing song
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async analyzeSong(req, res) {
        try {
            const songId = parseInt(req.params.songId, 10);
            
            if (isNaN(songId) || songId <= 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid song ID' 
                });
            }
            
            const song = dbService.getSong(songId);
            
            if (!song) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Song not found' 
                });
            }
            
            // Get file path from song content (assuming content is file path)
            const filePath = song.content;
            
            if (!filePath) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Song has no file path (may not be downloaded yet)' 
                });
            }
            
            // Analyze and store gain
            const gainDb = await volumeNormalization.analyzeAndStoreGain(songId, filePath);
            
            res.json({ 
                success: true, 
                gainDb: gainDb,
                message: `Song analyzed: gain adjustment = ${gainDb.toFixed(2)} dB`
            });
        } catch (err) {
            logger.error('Failed to analyze song:', err);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to analyze song: ' + err.message 
            });
        }
    }
}

module.exports = new VolumeNormalizationController();

