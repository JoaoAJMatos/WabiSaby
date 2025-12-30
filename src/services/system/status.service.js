const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
// Lazy load services to avoid circular dependency
let services = null;
const getServices = () => {
    if (!services) {
        services = require('../index');
    }
    return services;
};
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
    PLAYBACK_SKIP,
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
        this.pendingClients = new Set(); // Clients being set up, don't broadcast to them yet
        this.statusController = null; // Will be set after StatusController is initialized
        this.initialized = false;
        this.broadcastTimeout = null; // For debouncing broadcasts
        this.isBroadcasting = false; // Prevent concurrent broadcasts
        this.startupComplete = false; // Prevent broadcasts during startup
        this.periodicBroadcastInterval = null; // For periodic updates during playback
    }

    /**
     * Initialize event listeners
     * Must be called after StatusController is initialized
     */
    initialize(statusController) {
        if (this.initialized) return;
        this.statusController = statusController;

        this.setupEventListeners();

        this.initialized = true;
        // Allow broadcasts after a brief startup period
        setTimeout(() => {
            this.startupComplete = true;
        }, 1000);
    }

    /**
     * Setup event listeners (can be called independently)
     */
    setupEventListeners() {
        // Listen to all relevant events
        eventBus.on(QUEUE_ITEM_ADDED, () => {
            this.broadcastStatus();
            this.checkAndUpdatePeriodicBroadcast();
        });
        eventBus.on(QUEUE_ITEM_REMOVED, () => {
            this.broadcastStatus();
            this.checkAndUpdatePeriodicBroadcast();
        });
        eventBus.on(QUEUE_REORDERED, () => this.broadcastStatus());
        eventBus.on(QUEUE_CLEARED, () => {
            this.stopPeriodicBroadcast();
            this.broadcastStatus();
        });

        // PLAYBACK_STARTED is handled by QUEUE_UPDATED from orchestrator
        eventBus.on(PLAYBACK_FINISHED, () => {
            this.stopPeriodicBroadcast();
            this.broadcastStatus();
        });
        eventBus.on(PLAYBACK_PAUSED, () => {
            this.stopPeriodicBroadcast();
            this.broadcastStatus();
        });
        eventBus.on(PLAYBACK_RESUMED, () => {
            this.startPeriodicBroadcast();
            this.broadcastStatus();
        });
        eventBus.on(PLAYBACK_ERROR, () => {
            this.stopPeriodicBroadcast();
            this.broadcastStatus();
        });
        eventBus.on(PLAYBACK_SEEK, () => this.broadcastStatus());
        eventBus.on(PLAYBACK_SKIP, () => {
            this.stopPeriodicBroadcast();
            this.broadcastStatus();
        });

        eventBus.on(EFFECTS_CHANGED, () => this.broadcastStatus());
        eventBus.on(CONNECTION_CHANGED, () => this.broadcastStatus());
        
        // Countdown events - broadcast status when waveform state changes
        const {
            COUNTDOWN_PREFETCH_STARTED,
            COUNTDOWN_PREFETCH_COMPLETED,
            COUNTDOWN_WAVEFORM_GENERATION_STARTED,
            COUNTDOWN_WAVEFORM_READY
        } = require('../../events');
        
        eventBus.on(COUNTDOWN_PREFETCH_STARTED, () => this.broadcastStatus());
        eventBus.on(COUNTDOWN_PREFETCH_COMPLETED, () => this.broadcastStatus());
        eventBus.on(COUNTDOWN_WAVEFORM_GENERATION_STARTED, () => this.broadcastStatus());
        eventBus.on(COUNTDOWN_WAVEFORM_READY, () => this.broadcastStatus());
        
        // Start periodic broadcast when playback starts (via QUEUE_UPDATED)
        // We'll check if a song is playing and start/stop accordingly
        eventBus.on(QUEUE_UPDATED, () => {
            this.broadcastStatus();
            this.checkAndUpdatePeriodicBroadcast();
        });
    }

    /**
     * Add SSE client (initially as pending until setup is complete)
     */
    addClient(client) {
        this.pendingClients.add(client);
    }

    /**
     * Mark client as ready for broadcasts (called after SSE setup is complete)
     */
    activateClient(client) {
        this.pendingClients.delete(client);
        this.clients.add(client);
        
        // Check if we should start periodic broadcast now that we have a client
        this.checkAndUpdatePeriodicBroadcast();
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
            // Lazy load services
            const services = getServices();
            
            // Check if services are available
            if (!services || !services.playback) {
                // Services not ready yet (expected during startup) - return fallback silently
                return this._getStatusFallback();
            }

            // Get orchestrator if available (might not be during prefetch, but we can still get queue)
            const orchestrator = services.playback.orchestrator;
            const currentSong = orchestrator ? orchestrator.currentSong : null;
            const isPaused = orchestrator ? orchestrator.isPaused : false;

            // Create a clean, serializable copy of currentSong
            let current = null;
            if (currentSong) {
                current = {
                    id: currentSong.id,
                    songId: currentSong.songId,
                    content: currentSong.content,
                    sourceUrl: currentSong.sourceUrl,
                    type: currentSong.type,
                    title: currentSong.title,
                    artist: currentSong.artist,
                    channel: currentSong.channel,
                    requester: currentSong.requester,
                    sender: currentSong.sender,
                    remoteJid: currentSong.remoteJid,
                    isPriority: currentSong.isPriority,
                    downloadStatus: currentSong.downloadStatus,
                    downloadProgress: currentSong.downloadProgress,
                    downloading: currentSong.downloading,
                    thumbnail: currentSong.thumbnail,
                    thumbnailUrl: currentSong.thumbnailUrl,
                    prefetched: currentSong.prefetched,
                    duration: currentSong.duration,
                    startTime: currentSong.startTime,
                    pausedAt: currentSong.pausedAt
                };

                // Add elapsed time for sync (only to the copy)
                if (current.startTime) {
                    if (isPaused && current.pausedAt) {
                        current.elapsed = current.pausedAt - current.startTime;
                    } else {
                        current.elapsed = Date.now() - current.startTime;
                    }
                }

                // Fetch lyrics from database if songId is available
                if (current.songId) {
                    try {
                        const dbService = require('../../infrastructure/database/db.service');
                        const lyrics = dbService.getSongLyrics(current.songId);
                        if (lyrics) {
                            // Include lyrics in the song object
                            // The format from database should match what updateLyrics expects
                            current.lyrics = lyrics;
                        }
                    } catch (err) {
                        logger.debug('Error fetching lyrics for status:', err.message);
                        // Don't fail status build if lyrics fetch fails
                    }
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
                    if (!current.duration && services.metadata) {
                        try {
                            current.duration = await services.metadata.getAudioDuration(current.content);
                        } catch (err) {
                            logger.debug('Error getting audio duration:', err.message);
                        }
                    }

                    // Add thumbnail URL if available
                    if (current.thumbnail && fs.existsSync(current.thumbnail)) {
                        current.thumbnailUrl = helpersUtil.getThumbnailUrl(current.thumbnail);
                    }

                    // Update stats with duration and thumbnail if we have them
                    const updates = {};
                    if (current.duration) updates.duration = current.duration;
                    if (current.thumbnailUrl) updates.thumbnailUrl = current.thumbnailUrl;

                    if (Object.keys(updates).length > 0 && services.system && services.system.stats) {
                        services.system.stats.updateLastSong(current.content, updates);
                    }
                }
            }

            if (current) {
                current.isPaused = isPaused;
            }

            // Add thumbnail URLs to queue items
            // Check if queue service is available
            if (!services.playback.queue) {
                // Queue service not ready yet - return fallback
                return this._getStatusFallback();
            }

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
            let detailedStats = { songsPlayed: 0 };
            let uptime = 0;
            if (services.system && services.system.stats) {
                detailedStats = services.system.stats.getStats();
                uptime = services.system.stats.getUptime();
            }
            
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
            let groupsCount = 0;
            if (services.user && services.user.groups) {
                groupsCount = services.user.groups.getGroups().length;
            }

            // Action required when connected but no groups configured
            const actionRequired = isConnected && groupsCount === 0;

            // Get shuffle setting
            config._ensureSettingsLoaded();

            // Get QR code from status controller
            const latestQR = this.statusController?.latestQR || null;

            // Get countdown status if service is available
            let countdownStatus = null;
            if (services.countdown) {
                countdownStatus = services.countdown.getStatus();
            }

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
                    uptime: uptime,
                    songsPlayed: detailedStats.songsPlayed,
                    queueLength: queue.length
                },
                shuffleEnabled: config.playback.shuffleEnabled,
                repeatMode: config.playback.repeatMode,
                countdown: countdownStatus
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
            repeatMode: 'off',
            countdown: null
        };
    }

    /**
     * Broadcast status update to all SSE clients
     * Uses debouncing to prevent rapid successive broadcasts
     */
    broadcastStatus() {
        // If already broadcasting, skip this request
        if (this.isBroadcasting) {
            logger.debug('Skipping broadcast: already broadcasting');
            return;
        }

        // Clear any pending broadcast
        if (this.broadcastTimeout) {
            clearTimeout(this.broadcastTimeout);
        }

        // Debounce broadcasts to prevent overwhelming SSE connections
        this.broadcastTimeout = setTimeout(async () => {
            this.broadcastTimeout = null;
            this.isBroadcasting = true;

            try {
                if (this.clients.size === 0) {
                    logger.debug(`Skipping broadcast: no clients connected (${this.clients.size} clients)`);
                    return;
                }

                // Skip broadcasting during startup to prevent overwhelming connections
                if (!this.startupComplete) {
                    logger.debug('Skipping broadcast: startup not complete');
                    return;
                }

                // Lazy load services
                const services = getServices();
                
                // Skip broadcasting if services aren't ready yet (prevents spam during startup)
                // But allow broadcasts if queue service is available (for prefetch updates)
                if (!services || !services.playback || !services.playback.queue) {
                    logger.debug('Skipping broadcast: playback services not available');
                    return;
                }

                // Orchestrator might not be available during prefetch, but we can still broadcast queue updates
                // The _buildStatus method will handle missing orchestrator gracefully

                const status = await this.getStatus();
                const data = JSON.stringify(status);

                let successCount = 0;
                let errorCount = 0;

                this.clients.forEach(client => {
                    try {
                        client.write(`data: ${data}\n\n`);
                        successCount++;
                    } catch (err) {
                        // Client disconnected, remove it
                        this.clients.delete(client);
                        errorCount++;
                        logger.debug(`Removed disconnected SSE client: ${err.message}`);
                    }
                });
            } catch (error) {
                logger.error('Error broadcasting status:', error);
            } finally {
                this.isBroadcasting = false;
            }
        }, 200); // Increased debounce to 200ms
    }

    /**
     * Start periodic broadcasts for real-time progress updates
     */
    startPeriodicBroadcast() {
        // Only start if not already running and we have clients
        if (this.periodicBroadcastInterval) {
            return;
        }

        if (this.clients.size === 0) {
            return;
        }

        // Broadcast every second for smooth progress updates
        this.periodicBroadcastInterval = setInterval(() => {
            // Only broadcast if we have clients and services are ready
            if (this.clients.size > 0 && this.startupComplete) {
                const services = getServices();
                if (services && services.playback && services.playback.queue) {
                    // Use broadcastStatus which has debouncing built in
                    this.broadcastStatus();
                }
            } else if (this.clients.size === 0) {
                // No clients, stop periodic broadcast
                this.stopPeriodicBroadcast();
            }
        }, 1000); // Update every second
    }

    /**
     * Stop periodic broadcasts
     */
    stopPeriodicBroadcast() {
        if (this.periodicBroadcastInterval) {
            clearInterval(this.periodicBroadcastInterval);
            this.periodicBroadcastInterval = null;
        }
    }

    /**
     * Check if a song is playing and start/stop periodic broadcast accordingly
     */
    checkAndUpdatePeriodicBroadcast() {
        try {
            const services = getServices();
            if (!services || !services.playback || !services.playback.orchestrator) {
                this.stopPeriodicBroadcast();
                return;
            }

            const orchestrator = services.playback.orchestrator;
            const isPlaying = orchestrator.currentSong && !orchestrator.isPaused;

            if (isPlaying && this.clients.size > 0) {
                this.startPeriodicBroadcast();
            } else {
                this.stopPeriodicBroadcast();
            }
        } catch (error) {
            logger.debug('Error checking playback state for periodic broadcast:', error.message);
            this.stopPeriodicBroadcast();
        }
    }

    /**
     * Remove SSE client
     */
    removeClient(client) {
        this.clients.delete(client);
        this.pendingClients.delete(client);
        
        // Stop periodic broadcast if no clients left
        if (this.clients.size === 0) {
            this.stopPeriodicBroadcast();
        }
    }
}

// Export singleton
const statusService = new StatusService();

// Initialize event listeners immediately (they will work even without statusController for basic queue updates)
statusService.setupEventListeners();

module.exports = { statusService };

