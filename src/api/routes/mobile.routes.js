const express = require('express');
const path = require('path');
const fs = require('fs');
const queueManager = require('../../core/queue');
const playbackController = require('../../core/playback.controller');
const whatsappAdapter = require('../../core/whatsapp');
const metadataService = require('../../services/metadata.service');
const helpersUtil = require('../../utils/helpers.util');
const effectsService = require('../../services/effects.service');
const groupsService = require('../../services/groups.service');
const player = require('../../core/player');
const { EFFECTS_CHANGED } = require('../../core/events');
const { logger } = require('../../utils/logger.util');
const dbService = require('../../database/db.service');
const { authenticateMobile } = require('./mobile-auth.middleware');

const router = express.Router();

/**
 * Mobile Routes
 * Handles mobile VIP access endpoints
 */

/**
 * POST /api/mobile/auth
 * Authenticate with token and device fingerprint
 * First access: Register fingerprint
 * Subsequent: Verify fingerprint matches
 */
router.post('/mobile/auth', async (req, res) => {
    const { token, fingerprint } = req.body;
    
    if (!token) {
        return res.status(400).json({ error: 'Token required' });
    }
    
    if (!fingerprint) {
        return res.status(400).json({ error: 'Device fingerprint required' });
    }
    
    try {
        // Get VIP info by token
        const vip = dbService.getVipByToken(token);
        
        if (!vip) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        // Check if fingerprint is already registered
        const hasFingerprint = !!vip.device_fingerprint;
        
        if (hasFingerprint) {
            // Verify fingerprint matches
            const isValid = dbService.verifyDeviceFingerprint(token, fingerprint);
            
            if (!isValid) {
                return res.status(403).json({ 
                    error: 'Device fingerprint mismatch',
                    message: 'This link is bound to a different device.'
                });
            }
        } else {
            // First access - register fingerprint
            dbService.storeDeviceFingerprint(token, fingerprint);
            logger.info(`Device fingerprint registered for VIP: ${vip.whatsapp_id}`);
        }
        
        res.json({
            success: true,
            vip: {
                whatsappId: vip.whatsapp_id,
                name: vip.name
            },
            firstAccess: !hasFingerprint
        });
    } catch (error) {
        logger.error('Mobile authentication error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

/**
 * GET /api/mobile/status
 * Get current song and queue (requires authentication)
 */
router.get('/mobile/status', authenticateMobile, async (req, res) => {
    try {
        const current = playbackController.getCurrent();
        const isPaused = playbackController.isPaused;

        // Add elapsed time for sync
        if (current && current.startTime) {
            if (isPaused && current.pausedAt) {
                current.elapsed = current.pausedAt - current.startTime;
            } else {
                current.elapsed = Date.now() - current.startTime;
            }
        }
        
        // Extract filename for streaming if it's a file path
        if (current && current.content && current.type === 'file') {
            current.streamUrl = `/stream/${path.basename(current.content)}`;
            
            // Get duration if not already cached
            if (!current.duration && fs.existsSync(current.content)) {
                current.duration = await metadataService.getAudioDuration(current.content);
            }
            
            // Add thumbnail URL if available
            if (current.thumbnail && fs.existsSync(current.thumbnail)) {
                current.thumbnailUrl = helpersUtil.getThumbnailUrl(current.thumbnail);
            }
        }

        if (current) {
            current.isPaused = isPaused;
        }

        // Add thumbnail URLs to queue items
        const queue = queueManager.getQueue();
        const addThumbnailUrl = (item) => {
            if (item.thumbnail && fs.existsSync(item.thumbnail)) {
                const thumbnailUrl = helpersUtil.getThumbnailUrl(item.thumbnail);
                if (thumbnailUrl) {
                    return { ...item, thumbnailUrl };
                }
            }
            return item;
        };
        
        const queueWithThumbnails = queue.map(addThumbnailUrl);
        const isConnected = whatsappAdapter.getConnectionStatus();
        
        // Get groups count for action required check
        const groupsCount = groupsService.getGroups().length;
        
        // Action required when connected but no groups configured
        const actionRequired = isConnected && groupsCount === 0;
        
        // Include effects for cross-device synchronization
        const effects = effectsService.getEffects();
        const effectsPresets = effectsService.getPresetsInfo();
        
        // Fetch user profile picture
        let profilePicUrl = null;
        if (req.vip && req.vip.whatsappId) {
            try {
                const whatsappSocket = whatsappAdapter.socket;
                if (whatsappSocket) {
                    profilePicUrl = await whatsappSocket.profilePictureUrl(req.vip.whatsappId, 'image');
                }
            } catch (error) {
                logger.error('Error fetching profile picture for mobile:', error.message);
            }
        }
        
        res.json({
            auth: {
                isConnected,
                actionRequired
            },
            user: {
                whatsappId: req.vip?.whatsappId,
                name: req.vip?.name,
                profilePicUrl: profilePicUrl || null
            },
            queue: {
                queue: queueWithThumbnails,
                currentSong: current,
                isPaused: isPaused
            },
            effects: {
                effects: effects,
                presets: effectsPresets
            }
        });
    } catch (error) {
        logger.error('Error getting mobile status:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

/**
 * GET /api/mobile/effects
 * Get current effects and presets (requires authentication)
 */
router.get('/mobile/effects', authenticateMobile, (req, res) => {
    try {
        const backend = player.getBackend();
        res.json({
            effects: effectsService.getEffects(),
            presets: effectsService.getPresetsInfo(),
            backend: backend,
            seamless: backend === 'mpv'
        });
    } catch (err) {
        logger.error('Failed to get mobile effects:', err);
        res.status(500).json({ error: 'Failed to get effects settings' });
    }
});

/**
 * PUT /api/mobile/effects
 * Update effects settings (requires authentication)
 */
router.put('/mobile/effects', authenticateMobile, (req, res) => {
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
        logger.error('Failed to update mobile effects:', err);
        res.status(500).json({ error: 'Failed to update effects settings' });
    }
});

/**
 * POST /api/mobile/effects/preset/:presetId
 * Apply preset (requires authentication)
 */
router.post('/mobile/effects/preset/:presetId', authenticateMobile, (req, res) => {
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
 * Trigger effects update in player
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

