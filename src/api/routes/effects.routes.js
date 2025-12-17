const express = require('express');
const effectsService = require('../../services/effects.service');
const playbackController = require('../../core/playback.controller');
const { logger } = require('../../utils/logger.util');
const player = require('../../core/player');
const { EFFECTS_CHANGED } = require('../../core/events');
const { authenticateMobile } = require('./mobile-auth.middleware');

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
        if (!presetId) {
            return res.status(400).json({ error: 'Preset ID is required' });
        }
        const updated = effectsService.applyPreset(presetId);
        
        // Trigger playback restart if currently playing
        triggerEffectsUpdate();
        
        res.json({
            effects: updated,
            filterChain: effectsService.buildFilterChain()
        });
    } catch (err) {
        logger.error(`Failed to apply preset "${req.params.presetId}":`, err);
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
 * Optional mobile authentication middleware
 * Only authenticates if token is present, otherwise allows access
 */
function optionalMobileAuth(req, res, next) {
    const token = req.query.token || req.headers['x-mobile-token'];
    if (token) {
        // Token present - use mobile authentication
        authenticateMobile(req, res, next);
    } else {
        // No token - allow regular dashboard access
        next();
    }
}

/**
 * GET /api/effects/stream
 * Server-Sent Events endpoint for real-time effects updates
 * Supports both regular dashboard users and authenticated mobile users
 */
router.get('/effects/stream', optionalMobileAuth, setupSSEConnection);

/**
 * Setup SSE connection for effects streaming
 */
function setupSSEConnection(req, res) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    // Send initial connection event
    res.write(`event: connected\ndata: {"status": "connected"}\n\n`);
    
    // Add this response to clients
    effectsService.addClient(res);
    
    // Send current effects as initial data
    const currentEffects = effectsService.getEffects();
    const presets = effectsService.getPresetsInfo();
    const initialData = JSON.stringify({
        type: 'EFFECTS_UPDATE',
        effects: currentEffects,
        presets: presets
    });
    res.write(`data: ${initialData}\n\n`);
    
    // Handle client disconnect
    req.on('close', () => {
        effectsService.removeClient(res);
    });
    
    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
        try {
            res.write(`:heartbeat\n\n`);
        } catch {
            clearInterval(heartbeat);
            effectsService.removeClient(res);
        }
    }, 30000);
    
    req.on('close', () => {
        clearInterval(heartbeat);
    });
}

/**
 * Trigger effects update in player
 * MPV: Seamlessly updates filters via IPC
 * ffplay: Restarts playback at current position with new filters
 */
function triggerEffectsUpdate() {
    const current = playbackController.getCurrent();
    if (current) {
        const backend = player.getBackend();
        playbackController.emit(EFFECTS_CHANGED);
        if (backend === 'mpv') {
            logger.info('Effects changed - applying seamlessly via MPV IPC');
        } else {
            logger.info('Effects changed - restarting ffplay with new filters');
        }
    }
}

module.exports = { router };