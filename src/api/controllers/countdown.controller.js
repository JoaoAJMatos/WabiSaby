/**
 * Countdown Controller
 * Handles countdown configuration and status endpoints
 */

const countdownService = require('../../services/countdown/countdown.service');
const { logger } = require('../../utils/logger.util');

class CountdownController {
    /**
     * Get current countdown status
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getStatus(req, res) {
        try {
            const status = countdownService.getStatus();
            res.json({
                success: true,
                countdown: status
            });
        } catch (error) {
            logger.error('Failed to get countdown status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get countdown status'
            });
        }
    }

    /**
     * Update countdown configuration
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    updateConfig(req, res) {
        try {
            const { enabled, targetDate, showInPlayer, showThreshold, skipBuffer, song } = req.body;

            // Validate targetDate if provided
            if (targetDate !== undefined && targetDate !== null) {
                if (typeof targetDate !== 'string') {
                    return res.status(400).json({
                        success: false,
                        error: 'targetDate must be a string in ISO 8601 format'
                    });
                }
                const parsedDate = new Date(targetDate);
                if (isNaN(parsedDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        error: 'targetDate must be a valid date in ISO 8601 format'
                    });
                }
            }

            // Validate showThreshold if provided
            if (showThreshold !== undefined) {
                const threshold = parseInt(showThreshold, 10);
                if (isNaN(threshold) || threshold < 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'showThreshold must be a non-negative integer'
                    });
                }
            }

            // Validate skipBuffer if provided
            if (skipBuffer !== undefined) {
                const buffer = parseInt(skipBuffer, 10);
                if (isNaN(buffer) || buffer < 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'skipBuffer must be a non-negative integer'
                    });
                }
            }

            // Validate song object if provided
            if (song !== undefined) {
                if (typeof song !== 'object' || song === null) {
                    return res.status(400).json({
                        success: false,
                        error: 'song must be an object with url and timestamp properties'
                    });
                }
                if (song.timestamp !== undefined) {
                    const timestamp = parseInt(song.timestamp, 10);
                    if (isNaN(timestamp) || timestamp < 0) {
                        return res.status(400).json({
                            success: false,
                            error: 'song.timestamp must be a non-negative integer (seconds)'
                        });
                    }
                }
            }

            // Build update object
            const updateConfig = {};
            if (enabled !== undefined) updateConfig.enabled = Boolean(enabled);
            if (targetDate !== undefined) updateConfig.targetDate = targetDate;
            if (showInPlayer !== undefined) updateConfig.showInPlayer = Boolean(showInPlayer);
            if (showThreshold !== undefined) updateConfig.showThreshold = parseInt(showThreshold, 10);
            if (skipBuffer !== undefined) updateConfig.skipBuffer = parseInt(skipBuffer, 10);
            if (song !== undefined) {
                updateConfig.song = {};
                if (song.url !== undefined) updateConfig.song.url = song.url;
                if (song.timestamp !== undefined) updateConfig.song.timestamp = parseInt(song.timestamp, 10);
            }

            // Update configuration
            countdownService.updateConfig(updateConfig);

            // Get updated status
            const status = countdownService.getStatus();

            logger.info('Countdown configuration updated:', updateConfig);

            res.json({
                success: true,
                message: 'Countdown configuration updated',
                countdown: status
            });
        } catch (error) {
            logger.error('Failed to update countdown configuration:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update countdown configuration'
            });
        }
    }

    /**
     * Enable countdown
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    enable(req, res) {
        try {
            countdownService.updateConfig({ enabled: true });
            const status = countdownService.getStatus();

            res.json({
                success: true,
                message: 'Countdown enabled',
                countdown: status
            });
        } catch (error) {
            logger.error('Failed to enable countdown:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to enable countdown'
            });
        }
    }

    /**
     * Disable countdown
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    disable(req, res) {
        try {
            countdownService.updateConfig({ enabled: false });
            const status = countdownService.getStatus();

            res.json({
                success: true,
                message: 'Countdown disabled',
                countdown: status
            });
        } catch (error) {
            logger.error('Failed to disable countdown:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to disable countdown'
            });
        }
    }

    /**
     * Pre-fetch countdown song in background
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async prefetchSong(req, res) {
        try {
            const initiated = await countdownService.prefetchCountdownSong();
            const status = countdownService.getStatus();

            res.json({
                success: initiated,
                message: initiated 
                    ? 'Countdown song prefetch initiated' 
                    : 'Failed to initiate countdown song prefetch',
                countdown: status
            });
        } catch (error) {
            logger.error('Failed to prefetch countdown song:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to prefetch countdown song'
            });
        }
    }
}

module.exports = new CountdownController();
