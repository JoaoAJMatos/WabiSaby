const services = require('../../services');
const { logger } = require('../../utils/logger.util');
const player = require('../../infrastructure/player');
const { eventBus, EFFECTS_CHANGED } = require('../../events');
const { authenticateMobile } = require('../middleware/auth.middleware');

/**
 * Effects Controller
 * Handles audio effects settings and presets
 */

class EffectsController {
    /**
     * Get current effects settings and available presets
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getEffects(req, res) {
        try {
            const backend = player.getBackend();
            res.json({
                effects: services.audio.effects.getEffects(),
                presets: services.audio.effects.getPresetsInfo(),
                filterChain: services.audio.effects.buildFilterChain(),
                backend: backend,
                seamless: backend === 'mpv'
            });
        } catch (err) {
            logger.error('Failed to get effects:', err);
            res.status(500).json({ error: 'Failed to get effects settings' });
        }
    }

    /**
     * Update effects settings
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    updateEffects(req, res) {
        try {
            const newSettings = req.body;
            
            // Validate settings
            const errors = services.audio.effects.validate(newSettings);
            if (errors.length > 0) {
                return res.status(400).json({ errors });
            }
            
            const updated = services.audio.effects.updateEffects(newSettings);
            
            // Trigger playback restart if currently playing
            this._triggerEffectsUpdate();
            
            res.json({
                effects: updated,
                filterChain: services.audio.effects.buildFilterChain()
            });
        } catch (err) {
            logger.error('Failed to update effects:', err);
            res.status(500).json({ error: 'Failed to update effects settings' });
        }
    }

    /**
     * Apply a preset
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    applyPreset(req, res) {
        try {
            const { presetId } = req.params;
            if (!presetId) {
                return res.status(400).json({ error: 'Preset ID is required' });
            }
            const updated = services.audio.effects.applyPreset(presetId);
            
            // Trigger playback restart if currently playing
            this._triggerEffectsUpdate();
            
            res.json({
                effects: updated,
                filterChain: services.audio.effects.buildFilterChain()
            });
        } catch (err) {
            logger.error(`Failed to apply preset "${req.params.presetId}":`, err);
            res.status(400).json({ error: err.message });
        }
    }

    /**
     * Reset effects to defaults
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    resetEffects(req, res) {
        try {
            const reset = services.audio.effects.reset();
            
            // Trigger playback restart if currently playing
            this._triggerEffectsUpdate();
            
            res.json({
                effects: reset,
                filterChain: services.audio.effects.buildFilterChain()
            });
        } catch (err) {
            logger.error('Failed to reset effects:', err);
            res.status(500).json({ error: 'Failed to reset effects' });
        }
    }

    /**
     * Get all available presets
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getPresets(req, res) {
        try {
            res.json({
                presets: services.audio.effects.getPresetsInfo(),
                current: services.audio.effects.getEffects().preset
            });
        } catch (err) {
            logger.error('Failed to get presets:', err);
            res.status(500).json({ error: 'Failed to get presets' });
        }
    }

    /**
     * Optional mobile authentication middleware
     * Only authenticates if token is present, otherwise allows access
     */
    optionalMobileAuth(req, res, next) {
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
     * Setup SSE connection for effects streaming
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    setupSSEConnection(req, res) {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        
        // Send initial connection event
        res.write(`event: connected\ndata: {"status": "connected"}\n\n`);
        
        // Add this response to clients
        services.audio.effects.addClient(res);
        
        // Send current effects as initial data
        const currentEffects = services.audio.effects.getEffects();
        const presets = services.audio.effects.getPresetsInfo();
        const initialData = JSON.stringify({
            type: 'EFFECTS_UPDATE',
            effects: currentEffects,
            presets: presets
        });
        res.write(`data: ${initialData}\n\n`);
        
        // Handle client disconnect
        req.on('close', () => {
            services.audio.effects.removeClient(res);
        });
        
        // Keep connection alive with periodic heartbeat
        const heartbeat = setInterval(() => {
            try {
                res.write(`:heartbeat\n\n`);
            } catch {
                clearInterval(heartbeat);
                services.audio.effects.removeClient(res);
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
    _triggerEffectsUpdate() {
        const current = services.playback.orchestrator.getCurrent();
        if (current) {
            const backend = player.getBackend();
            eventBus.emit(EFFECTS_CHANGED);
            if (backend === 'mpv') {
                logger.info('Effects changed - applying seamlessly via MPV IPC');
            } else {
                logger.info('Effects changed - restarting ffplay with new filters');
            }
        }
    }
}

module.exports = new EffectsController();

