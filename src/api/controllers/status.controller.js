const path = require('path');
const fs = require('fs');
const services = require('../../services');
const infrastructure = require('../../infrastructure');
const config = require('../../config');
const helpersUtil = require('../../utils/helpers.util');
const { logger } = require('../../utils/logger.util');

/**
 * Status Controller
 * Handles combined status endpoint for auth, queue, and stats
 */

class StatusController {
    constructor() {
        this.latestQR = null;
        this.latestStatus = null;
    }

    /**
     * Update authentication status (called from WhatsApp module for QR code)
     * @param {string} status - Auth status ('open', 'close', 'qr', etc.)
     * @param {string} qr - QR code data
     */
    updateAuthStatus(status, qr) {
        this.latestQR = qr || null;
        this.latestStatus = status || null;
        // Clear QR code when connection opens
        if (status === 'open') {
            this.latestQR = null;
        }
    }

    /**
     * Setup SSE connection for status streaming
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async setupSSEConnection(req, res) {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        
        // Send initial connection event
        res.write(`event: connected\ndata: {"status": "connected"}\n\n`);
        
        // Initialize status service if not already done
        if (!services.system.status.statusService.initialized) {
            services.system.status.statusService.initialize(this);
        }
        
        // Add this response to pending clients (will be activated after setup)
        services.system.status.statusService.addClient(res);

        // Send current status as initial data
        try {
            const status = await services.system.status.statusService.getStatus();
            const initialData = JSON.stringify(status);
            res.write(`data: ${initialData}\n\n`);

            // Now activate the client for broadcasts
            services.system.status.statusService.activateClient(res);
        } catch (error) {
            logger.error('Error sending initial status:', error);
            // Remove client if initial write fails
            services.system.status.statusService.removeClient(res);
            
            // Send error via SSE format and end the connection
            try {
                const errorData = JSON.stringify({
                    error: 'Failed to get initial status',
                    message: error?.message || 'Unknown error'
                });
                res.write(`event: error\ndata: ${errorData}\n\n`);
            } catch (writeError) {
                // If we can't write, the connection is likely already closed
                logger.debug('Could not write error to SSE stream:', writeError);
            }
            
            // End the response to prevent error middleware from trying to send JSON
            try {
                res.end();
            } catch (endError) {
                // Response might already be ended
                logger.debug('Could not end SSE response:', endError);
            }
            
            return;
        }

        // Keep connection alive with periodic heartbeat
        const heartbeat = setInterval(() => {
            try {
                res.write(`:heartbeat\n\n`);
            } catch {
                clearInterval(heartbeat);
                services.system.status.statusService.removeClient(res);
            }
        }, 30000);

        // Handle client disconnect
        req.on('close', () => {
            clearInterval(heartbeat);
            services.system.status.statusService.removeClient(res);
        });
    }

    /**
     * Get combined status (Queue + Auth + Stats)
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async getStatus(req, res) {
        try {
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

            // Get countdown status
            const countdownStatus = services.countdown ? services.countdown.getStatus() : null;

            res.json({
                auth: {
                    isConnected: !!isConnected, // Ensure it's a boolean
                    qr: this.latestQR,
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
                repeatMode: config.playback.repeatMode,
                countdown: countdownStatus
            });
        } catch (error) {
            // Log detailed error information
            const errorMsg = error?.message || String(error) || 'Unknown error';
            const errorStack = error?.stack || 'No stack trace available';
            const errorType = error?.constructor?.name || typeof error;
            
            logger.error(`Error in getStatus: ${errorType}: ${errorMsg}`);
            logger.error(`Stack: ${errorStack}`);
            if (error && typeof error === 'object') {
                logger.error(`Error object keys: ${Object.keys(error).join(', ')}`);
                try {
                    logger.error(`Full error: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
                } catch (e) {
                    logger.error(`Could not stringify error: ${e.message}`);
                }
            }
            res.status(500).json({ error: 'Failed to get status', message: errorMsg });
        }
    }
}

module.exports = new StatusController();
