const express = require('express');
const player = require('../../core/player');
const dbService = require('../../database/db.service');
const { logger } = require('../../utils/logger.util');
const playbackController = require('../../core/playback.controller');
const { EFFECTS_CHANGED } = require('../../core/events');

const router = express.Router();

/**
 * Volume Routes
 * Manages volume control settings
 */

/**
 * GET /api/volume
 * Get current volume setting
 */
router.get('/volume', (req, res) => {
    try {
        // Try to get from database first, fallback to player state
        const savedVolume = dbService.getSetting('volume');
        const volume = savedVolume !== null ? savedVolume : player.getVolume();
        
        res.json({ volume });
    } catch (err) {
        logger.error('Failed to get volume:', err);
        res.status(500).json({ error: 'Failed to get volume' });
    }
});

/**
 * PUT /api/volume
 * Update volume (0-100)
 */
router.put('/volume', (req, res) => {
    try {
        const { volume } = req.body;
        
        if (typeof volume !== 'number' || volume < 0 || volume > 100) {
            return res.status(400).json({ error: 'Volume must be a number between 0 and 100' });
        }
        
        player.setVolume(volume);
        
        dbService.setSetting('volume', volume);
        
        const backend = player.getBackend();
        if (backend === 'ffplay') {
            playbackController.emit(EFFECTS_CHANGED);
        }
        
        res.json({ volume });
    } catch (err) {
        logger.error('Failed to update volume:', err);
        res.status(500).json({ error: 'Failed to update volume' });
    }
});

module.exports = { router };

