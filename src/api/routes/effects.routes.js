const express = require('express');
const effectsService = require('../../services/effects.service');
const queueManager = require('../../core/queue');
const { logger } = require('../../utils/logger.util');
const player = require('../../core/player');

const router = express.Router();

/**
 * Effects Routes
 * Manages audio effects settings and presets
 */

/**
 * GET /api/effects
 * Get current effects settings and available presets
 */
router.get('/effects', (req, res) => {
    try {
        const backend = player.getBackend();
        res.json({
            effects: effectsService.getEffects(),
            presets: effectsService.getPresetsInfo(),
            filterChain: effectsService.buildFilterChain(),
            backend: backend,
            seamless: backend === 'mpv'
        });
    } catch (err) {
        logger.error('Failed to get effects:', err);
        res.status(500).json({ error: 'Failed to get effects settings' });
    }
});

/**
 * PUT /api/effects
 * Update effects settings
 */
router.put('/effects', (req, res) => {
    try {
        const newSettings = req.body;
        
        // Validate settings
        const errors = effectsService.validate(newSettings);
        if (errors.length > 0) {
            return res.status(400).json({ errors });
        }
        
        const updated = effectsService.updateEffects(newSettings);
        
        // Trigger playback restart if currently playing
        triggerEffectsUpdate();
        
        res.json({
            effects: updated,
            filterChain: effectsService.buildFilterChain()
        });
    } catch (err) {
        logger.error('Failed to update effects:', err);
        res.status(500).json({ error: 'Failed to update effects settings' });
    }
});

/**
 * POST /api/effects/preset/:presetId
 * Apply a preset
 */
router.post('/effects/preset/:presetId', (req, res) => {
    try {
        const { presetId } = req.params;
        const updated = effectsService.applyPreset(presetId);
        
        // Trigger playback restart if currently playing
        triggerEffectsUpdate();
        
        res.json({
            effects: updated,
            filterChain: effectsService.buildFilterChain()
        });
    } catch (err) {
        logger.error('Failed to apply preset:', err);
        res.status(400).json({ error: err.message });
    }
});

/**
 * POST /api/effects/reset
 * Reset effects to defaults
 */
router.post('/effects/reset', (req, res) => {
    try {
        const reset = effectsService.reset();
        
        // Trigger playback restart if currently playing
        triggerEffectsUpdate();
        
        res.json({
            effects: reset,
            filterChain: effectsService.buildFilterChain()
        });
    } catch (err) {
        logger.error('Failed to reset effects:', err);
        res.status(500).json({ error: 'Failed to reset effects' });
    }
});

/**
 * GET /api/effects/presets
 * Get all available presets
 */
router.get('/effects/presets', (req, res) => {
    try {
        res.json({
            presets: effectsService.getPresetsInfo(),
            current: effectsService.getEffects().preset
        });
    } catch (err) {
        logger.error('Failed to get presets:', err);
        res.status(500).json({ error: 'Failed to get presets' });
    }
});

/**
 * Trigger effects update in player
 * MPV: Seamlessly updates filters via IPC
 * ffplay: Restarts playback at current position with new filters
 */
function triggerEffectsUpdate() {
    const current = queueManager.getCurrent();
    if (current) {
        const backend = player.getBackend();
        queueManager.emit('effects_changed');
        if (backend === 'mpv') {
            logger.info('Effects changed - applying seamlessly via MPV IPC');
        } else {
            logger.info('Effects changed - restarting ffplay with new filters');
        }
    }
}

module.exports = { router };