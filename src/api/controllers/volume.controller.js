const player = require('../../infrastructure/player');
const dbService = require('../../infrastructure/database/db.service');
const { logger } = require('../../utils/logger.util');
const services = require('../../services');
const { eventBus, EFFECTS_CHANGED } = require('../../events');

/**
 * Volume Controller
 * Handles volume control settings
 */

class VolumeController {
    /**
     * Get current volume setting
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getVolume(req, res) {
        try {
            // Try to get from database first, fallback to player state
            const savedVolume = dbService.getSetting('volume');
            const volume = savedVolume !== null ? savedVolume : player.getVolume();
            
            res.json({ volume });
        } catch (err) {
            logger.error('Failed to get volume:', err);
            res.status(500).json({ error: 'Failed to get volume' });
        }
    }

    /**
     * Update volume (0-100)
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async updateVolume(req, res) {
        try {
            const { volume } = req.body;
            
            if (typeof volume !== 'number' || volume < 0 || volume > 100) {
                return res.status(400).json({ error: 'Volume must be a number between 0 and 100' });
            }
            
            await player.setVolume(volume);
            
            dbService.setSetting('volume', volume);
            
            const backend = player.getBackend();
            if (backend === 'ffplay') {
                eventBus.emit(EFFECTS_CHANGED);
            }
            
            res.json({ volume });
        } catch (err) {
            logger.error('Failed to update volume:', err);
            res.status(500).json({ error: 'Failed to update volume' });
        }
    }
}

module.exports = new VolumeController();

