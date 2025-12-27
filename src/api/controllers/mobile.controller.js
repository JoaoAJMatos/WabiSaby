const path = require('path');
const fs = require('fs');
const services = require('../../services');
const whatsappAdapter = require('../../infrastructure/whatsapp/adapter');
const metadataService = require('../../services/metadata/metadata.service');
const helpersUtil = require('../../utils/helpers.util');
const effectsService = require('../../services/audio/effects.service');
const groupsService = require('../../services/user/groups.service');
const player = require('../../infrastructure/player');
const { eventBus, EFFECTS_CHANGED } = require('../../events');
const { logger } = require('../../utils/logger.util');
const dbService = require('../../infrastructure/database/db.service');
const { authenticateMobile } = require('../middleware/auth.middleware');

/**
 * Mobile Controller
 * Handles mobile VIP access endpoints
 */

class MobileController {
    constructor() {
        this.mobileStatusClients = new Set();
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for mobile status updates
     */
    setupEventListeners() {
        const {
            QUEUE_UPDATED,
            QUEUE_ITEM_ADDED,
            QUEUE_ITEM_REMOVED,
            QUEUE_REORDERED,
            QUEUE_CLEARED,
            PLAYBACK_STARTED,
            PLAYBACK_FINISHED,
            PLAYBACK_PAUSED,
            PLAYBACK_RESUMED,
            PLAYBACK_ERROR,
            PLAYBACK_SEEK,
            EFFECTS_CHANGED,
            CONNECTION_CHANGED
        } = require('../../events');

        // Listen to all relevant events and broadcast mobile status
        const broadcastMobileStatus = async () => {
            await this.broadcastMobileStatus();
        };

        eventBus.on(QUEUE_UPDATED, broadcastMobileStatus);
        eventBus.on(QUEUE_ITEM_ADDED, broadcastMobileStatus);
        eventBus.on(QUEUE_ITEM_REMOVED, broadcastMobileStatus);
        eventBus.on(QUEUE_REORDERED, broadcastMobileStatus);
        eventBus.on(QUEUE_CLEARED, broadcastMobileStatus);
        eventBus.on(PLAYBACK_STARTED, broadcastMobileStatus);
        eventBus.on(PLAYBACK_FINISHED, broadcastMobileStatus);
        eventBus.on(PLAYBACK_PAUSED, broadcastMobileStatus);
        eventBus.on(PLAYBACK_RESUMED, broadcastMobileStatus);
        eventBus.on(PLAYBACK_ERROR, broadcastMobileStatus);
        eventBus.on(PLAYBACK_SEEK, broadcastMobileStatus);
        eventBus.on(EFFECTS_CHANGED, broadcastMobileStatus);
        eventBus.on(CONNECTION_CHANGED, broadcastMobileStatus);
    }

    /**
     * Broadcast mobile status to all connected mobile clients
     */
    async broadcastMobileStatus() {
        if (this.mobileStatusClients.size === 0) return;

        // We need to broadcast to each client with their specific req context
        // For now, we'll store req with each client
        const clientsToRemove = [];
        
        for (const clientData of this.mobileStatusClients) {
            try {
                const status = await this.getMobileStatusForSSE(clientData.req);
                const data = JSON.stringify(status);
                clientData.res.write(`data: ${data}\n\n`);
            } catch (err) {
                logger.error('Error broadcasting mobile status:', err);
                clientsToRemove.push(clientData);
            }
        }

        // Remove disconnected clients
        clientsToRemove.forEach(clientData => {
            this.mobileStatusClients.delete(clientData);
        });
    }
    /**
     * Authenticate with token and device fingerprint
     * First access: Register fingerprint
     * Subsequent: Verify fingerprint matches
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async authenticate(req, res) {
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
    }

    /**
     * Get current song and queue (requires authentication)
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async getStatus(req, res) {
        try {
            const current = services.playback.orchestrator.getCurrent();
            const isPaused = services.playback.orchestrator.isPaused;

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
            const queue = services.playback.queue.getQueue();
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
    }

    /**
     * Setup SSE connection for mobile status streaming
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async setupStatusSSE(req, res) {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        
        // Send initial connection event
        res.write(`event: connected\ndata: {"status": "connected"}\n\n`);
        
        // Store client with req context for mobile-specific status
        const clientData = { req, res };
        this.mobileStatusClients.add(clientData);
        
        // Send current mobile status as initial data
        try {
            const status = await this.getMobileStatusForSSE(req);
            const initialData = JSON.stringify(status);
            res.write(`data: ${initialData}\n\n`);
        } catch (error) {
            logger.error('Error sending initial mobile status:', error);
        }
        
        // Handle client disconnect
        req.on('close', () => {
            this.mobileStatusClients.delete(clientData);
        });
        
        // Keep connection alive with periodic heartbeat
        const heartbeat = setInterval(() => {
            try {
                res.write(`:heartbeat\n\n`);
            } catch {
                clearInterval(heartbeat);
                this.mobileStatusClients.delete(clientData);
            }
        }, 30000);
        
        req.on('close', () => {
            clearInterval(heartbeat);
        });
    }

    /**
     * Get mobile status for SSE (reuses getStatus logic but returns object instead of sending response)
     */
    async getMobileStatusForSSE(req) {
        const current = services.playback.orchestrator.getCurrent();
        const isPaused = services.playback.orchestrator.isPaused;

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
        const queue = services.playback.queue.getQueue();
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
        
        return {
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
        };
    }

    /**
     * Get current effects and presets (requires authentication)
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getEffects(req, res) {
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
    }

    /**
     * Update effects settings (requires authentication)
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    updateEffects(req, res) {
        try {
            const newSettings = req.body;
            
            // Validate settings
            const errors = effectsService.validate(newSettings);
            if (errors.length > 0) {
                return res.status(400).json({ errors });
            }
            
            const updated = effectsService.updateEffects(newSettings);
            
            // Trigger playback restart if currently playing
            this._triggerEffectsUpdate();
            
            res.json({
                effects: updated,
                filterChain: effectsService.buildFilterChain()
            });
        } catch (err) {
            logger.error('Failed to update mobile effects:', err);
            res.status(500).json({ error: 'Failed to update effects settings' });
        }
    }

    /**
     * Apply preset (requires authentication)
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    applyPreset(req, res) {
        try {
            const { presetId } = req.params;
            if (!presetId) {
                return res.status(400).json({ error: 'Preset ID is required' });
            }
            const updated = effectsService.applyPreset(presetId);
            
            // Trigger playback restart if currently playing
            this._triggerEffectsUpdate();
            
            res.json({
                effects: updated,
                filterChain: effectsService.buildFilterChain()
            });
        } catch (err) {
            logger.error(`Failed to apply preset "${req.params.presetId}":`, err);
            res.status(400).json({ error: err.message });
        }
    }

    /**
     * Trigger effects update in player
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

module.exports = new MobileController();

