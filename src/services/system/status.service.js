const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const services = require('../index');
const infrastructure = require('../../infrastructure');
const config = require('../../config');
const helpersUtil = require('../../utils/helpers.util');
const { logger } = require('../../utils/logger.util');
const {
    eventBus,
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

/**
 * Status Service
 * Manages SSE clients for real-time status updates
 * Broadcasts status changes when events occur
 */
class StatusService extends EventEmitter {
    constructor() {
        super();
        this.clients = new Set();
        this.statusController = null; // Will be set after StatusController is initialized
        this.initialized = false;
    }

    /**
     * Initialize event listeners
     * Must be called after StatusController is initialized
     */
    initialize(statusController) {
        if (this.initialized) return;
        this.statusController = statusController;
        
        // Listen to all relevant events
        eventBus.on(QUEUE_UPDATED, () => this.broadcastStatus());
        eventBus.on(QUEUE_ITEM_ADDED, () => this.broadcastStatus());
        eventBus.on(QUEUE_ITEM_REMOVED, () => this.broadcastStatus());
        eventBus.on(QUEUE_REORDERED, () => this.broadcastStatus());
        eventBus.on(QUEUE_CLEARED, () => this.broadcastStatus());
        
        eventBus.on(PLAYBACK_STARTED, () => this.broadcastStatus());
        eventBus.on(PLAYBACK_FINISHED, () => this.broadcastStatus());
        eventBus.on(PLAYBACK_PAUSED, () => this.broadcastStatus());
        eventBus.on(PLAYBACK_RESUMED, () => this.broadcastStatus());
        eventBus.on(PLAYBACK_ERROR, () => this.broadcastStatus());
        eventBus.on(PLAYBACK_SEEK, () => this.broadcastStatus());
        
        eventBus.on(EFFECTS_CHANGED, () => this.broadcastStatus());
        eventBus.on(CONNECTION_CHANGED, () => this.broadcastStatus());
        
        this.initialized = true;
    }

    /**
     * Add SSE client
     */
    addClient(client) {
        this.clients.add(client);
    }

    /**
     * Remove SSE client
     */
    removeClient(client) {
        this.clients.delete(client);
    }

    /**
     * Get current status (reuses logic from StatusController)
     * This is async because getStatus is async
     */
    async getStatus() {
        if (!this.statusController) {
            // Fallback if StatusController not initialized yet
            return this._getStatusFallback();
        }
        
        // Use StatusController's getStatus logic
        // We'll need to call it, but we need to create a mock req/res
        // Actually, let's extract the logic into a shared method
        return this._buildStatus();
    }

    /**
     * Build status object (extracted from StatusController logic)
     */
    async _buildStatus() {
        try {
            // Check if services are available
            if (!services || !services.playback || !services.playback.orchestrator) {
                // Services not ready yet (expected during startup) - return fallback silently
                return this._getStatusFallback();
            }

            const orchestrator = services.playback.orchestrator;
            const current = orchestrator.currentSong;
            const isPaused = orchestrator.isPaused;

            // Add elapsed time for sync
            if (current && current.startTime) {
                if (isPaused && current.pausedAt) {
                    current.elapsed = current.pausedAt - current.startTime;
                } else {
                    current.elapsed = Date.now() - current.startTime;
                }
            }

            // Extract filename for streaming if it's a file path
            const isFile = current && current.content && (
                current.type === 'file' ||
                (!current.content.startsWith('http://') && !current.content.startsWith('https://'))
            );

            if (isFile) {
                const fileExists = fs.existsSync(current.content);

                // Only generate streamUrl if file exists
                if (fileExists) {
                    current.streamUrl = `/stream/${path.basename(current.content)}`;
                    // Ensure type is set
                    if (!current.type) {
                        current.type = 'file';
                    }

                    // Get duration if not already cached
                    if (!current.duration) {
                        current.duration = await services.metadata.getAudioDuration(current.content);
                    }

                    // Add thumbnail URL if available
                    if (current.thumbnail && fs.existsSync(current.thumbnail)) {
                        current.thumbnailUrl = helpersUtil.getThumbnailUrl(current.thumbnail);
                    }

                    // Update stats with duration and thumbnail if we have them
                    const updates = {};
                    if (current.duration) updates.duration = current.duration;
                    if (current.thumbnailUrl) updates.thumbnailUrl = current.thumbnailUrl;

                    if (Object.keys(updates).length > 0) {
                        services.system.stats.updateLastSong(current.content, updates);
                    }
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

            // Get stats from statsService for consistency
            const detailedStats = services.system.stats.getStats();
            
            // Safely get connection status
            let isConnected = false;
            try {
                isConnected = infrastructure.whatsapp?.adapter?.getConnectionStatus() ?? false;
            } catch (err) {
                logger.warn('Error getting connection status:', err);
                isConnected = false;
            }
            
            // Ensure isConnected is always a boolean
            isConnected = Boolean(isConnected);

            // Get groups count for onboarding hints
            const groupsCount = services.user.groups.getGroups().length;

            // Action required when connected but no groups configured
            const actionRequired = isConnected && groupsCount === 0;

            // Get shuffle setting
            config._ensureSettingsLoaded();

            // Get QR code from status controller
            const latestQR = this.statusController?.latestQR || null;

            return {
                auth: {
                    isConnected: !!isConnected,
                    qr: latestQR,
                    groupsCount,
                    actionRequired
                },
                queue: {
                    queue: queueWithThumbnails,
                    currentSong: current,
                    isPaused: isPaused
                },
                stats: {
                    uptime: services.system.stats.getUptime(),
                    songsPlayed: detailedStats.songsPlayed,
                    queueLength: queue.length
                },
                shuffleEnabled: config.playback.shuffleEnabled,
                repeatMode: config.playback.repeatMode
            };
        } catch (error) {
            const errorMsg = error?.message || String(error) || 'Unknown error';
            const errorStack = error?.stack || 'No stack trace';
            logger.error(`Error building status: ${errorMsg}`);
            if (errorStack !== 'No stack trace') {
                logger.error(`Stack: ${errorStack}`);
            }
            return this._getStatusFallback();
        }
    }

    /**
     * Fallback status if StatusController not available
     */
    _getStatusFallback() {
        return {
            auth: {
                isConnected: false,
                qr: null,
                groupsCount: 0,
                actionRequired: false
            },
            queue: {
                queue: [],
                currentSong: null,
                isPaused: true
            },
            stats: {
                uptime: 0,
                songsPlayed: 0,
                queueLength: 0
            },
            shuffleEnabled: false,
            repeatMode: 'off'
        };
    }

    /**
     * Broadcast status update to all SSE clients
     */
    async broadcastStatus() {
        if (this.clients.size === 0) return;
        
        // Skip broadcasting if services aren't ready yet (prevents spam during startup)
        if (!services || !services.playback || !services.playback.orchestrator) {
            return;
        }
        
        try {
            const status = await this.getStatus();
            const data = JSON.stringify(status);
            
            this.clients.forEach(client => {
                try {
                    client.write(`data: ${data}\n\n`);
                } catch (err) {
                    // Client disconnected, remove it
                    this.clients.delete(client);
                }
            });
        } catch (error) {
            logger.error('Error broadcasting status:', error);
        }
    }
}

// Export singleton
const statusService = new StatusService();

module.exports = { statusService };

