/**
 * Countdown Service
 * Handles countdown synchronization with song playback
 */

const config = require('../../config');
const { logger } = require('../../utils/logger.util');
const { eventBus, PLAYBACK_STARTED, PLAYBACK_FINISHED, PLAYBACK_SKIP } = require('../../events');

class CountdownService {
    constructor() {
        this.checkInterval = null;
        this.songQueued = false;
        this.songStarted = false;
        this.lastCheck = 0;
        this.prefetchedSong = null; // Store pre-fetched song data
        this.prefetchInProgress = false;

        // Listen to playback events to track song state
        eventBus.on(PLAYBACK_STARTED, () => {
            // Check if this is our countdown song
            const current = this._getOrchestrator()?.currentSong;
            if (current && this._isCountdownSong(current)) {
                this.songStarted = true;
                logger.info('Countdown song started playing');
            }
        });

        eventBus.on(PLAYBACK_FINISHED, () => {
            // Reset song state when playback finishes
            this.songStarted = false;
        });
    }

    /**
     * Get time remaining until target date
     * @returns {number|null} Milliseconds remaining, or null if not configured
     */
    getTimeRemaining() {
        config._ensureSettingsLoaded();

        if (!config.countdown.enabled || !config.countdown.targetDate) {
            return null;
        }

        const targetTime = new Date(config.countdown.targetDate).getTime();
        const now = Date.now();

        return Math.max(0, targetTime - now);
    }

    /**
     * Calculate when the song should start playing
     * @param {Date|string} targetDate - Target date for countdown zero
     * @param {number} songTimestamp - Seconds into song at countdown zero
     * @returns {number} Unix timestamp (ms) when song should start
     */
    calculateSongStartTime(targetDate, songTimestamp) {
        const targetTime = new Date(targetDate).getTime();
        const songTimestampMs = songTimestamp * 1000;
        return targetTime - songTimestampMs;
    }

    /**
     * Format milliseconds as HH:MM:SS
     * @param {number} ms - Milliseconds
     * @returns {string} Formatted time string
     */
    formatTimeRemaining(ms) {
        if (ms <= 0) return '00:00:00';

        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .map(n => n.toString().padStart(2, '0'))
            .join(':');
    }

    /**
     * Get current countdown status
     * @returns {Object} Countdown status object
     */
    getStatus() {
        config._ensureSettingsLoaded();

        const timeRemaining = this.getTimeRemaining();

        return {
            enabled: config.countdown.enabled,
            targetDate: config.countdown.targetDate,
            timeRemaining,
            formattedTime: timeRemaining !== null ? this.formatTimeRemaining(timeRemaining) : null,
            showInPlayer: config.countdown.showInPlayer,
            showThreshold: config.countdown.showThreshold,
            message: config.countdown.message || 'Happy New Year!',
            song: {
                url: config.countdown.song?.url || null,
                timestamp: config.countdown.song?.timestamp || 0,
            },
            songQueued: this.songQueued,
            songStarted: this.songStarted,
            songPrefetched: this.prefetchedSong !== null,
            prefetchInProgress: this.prefetchInProgress,
        };
    }

    /**
     * Update countdown configuration
     * @param {Object} newConfig - New countdown configuration
     */
    updateConfig(newConfig) {
        config._ensureSettingsLoaded();

        // Update config with deep merge for song object
        if (newConfig.enabled !== undefined) config.countdown.enabled = newConfig.enabled;
        if (newConfig.targetDate !== undefined) config.countdown.targetDate = newConfig.targetDate;
        if (newConfig.showInPlayer !== undefined) config.countdown.showInPlayer = newConfig.showInPlayer;
        if (newConfig.showThreshold !== undefined) config.countdown.showThreshold = newConfig.showThreshold;
        if (newConfig.skipBuffer !== undefined) config.countdown.skipBuffer = newConfig.skipBuffer;
        if (newConfig.message !== undefined) config.countdown.message = newConfig.message;

        if (newConfig.song) {
            const oldUrl = config.countdown.song?.url;
            if (newConfig.song.url !== undefined) {
                config.countdown.song.url = newConfig.song.url;
                // If URL changed, clear prefetched song
                if (oldUrl !== newConfig.song.url) {
                    this.prefetchedSong = null;
                    this.prefetchInProgress = false;
                }
            }
            if (newConfig.song.timestamp !== undefined) config.countdown.song.timestamp = newConfig.song.timestamp;
        }

        // Save to database
        config.saveSettings();

        // Reset state when config changes
        this.songQueued = false;
        this.songStarted = false;

        logger.info('Countdown configuration updated:', {
            enabled: config.countdown.enabled,
            targetDate: config.countdown.targetDate,
        });
    }

    /**
     * Check if a song is the countdown song
     * @private
     */
    _isCountdownSong(song) {
        config._ensureSettingsLoaded();
        const countdownUrl = config.countdown.song?.url;
        if (!countdownUrl || !song) return false;

        // Check if content or sourceUrl matches countdown URL
        return song.content === countdownUrl ||
               song.sourceUrl === countdownUrl ||
               song.title?.includes('countdown');
    }

    /**
     * Get orchestrator service (lazy loaded to avoid circular dependencies)
     * @private
     */
    _getOrchestrator() {
        if (!this._orchestrator) {
            const services = require('../index');
            this._orchestrator = services.playback.orchestrator;
        }
        return this._orchestrator;
    }

    /**
     * Get queue service (lazy loaded)
     * @private
     */
    _getQueueService() {
        if (!this._queueService) {
            const services = require('../index');
            this._queueService = services.playback.queue;
        }
        return this._queueService;
    }

    /**
     * Pre-fetch countdown song in background without adding to queue
     * @returns {Promise<boolean>} True if fetch was initiated
     */
    async prefetchCountdownSong() {
        config._ensureSettingsLoaded();

        const songUrl = config.countdown.song?.url;
        if (!songUrl) {
            logger.warn('No countdown song URL configured');
            return false;
        }

        // If already prefetched and URL matches, return success
        if (this.prefetchedSong && this.prefetchedSong.sourceUrl === songUrl) {
            logger.debug('Countdown song already prefetched');
            return true;
        }

        // If prefetch is already in progress, return
        if (this.prefetchInProgress) {
            logger.debug('Countdown song prefetch already in progress');
            return true;
        }

        this.prefetchInProgress = true;

        try {
            const { downloadTrack } = require('../audio/download.service');
            
            logger.info('Starting background prefetch of countdown song:', { url: songUrl });
            
            // Download in background (don't await - let it run async)
            downloadTrack(songUrl, null, null)
                .then((result) => {
                    this.prefetchedSong = {
                        filePath: result.filePath,
                        sourceUrl: songUrl,
                        title: result.title,
                        artist: result.artist,
                        thumbnailPath: result.thumbnailPath,
                        prefetchedAt: Date.now()
                    };
                    this.prefetchInProgress = false;
                    logger.info('Countdown song prefetched successfully:', {
                        title: result.title,
                        filePath: result.filePath
                    });
                })
                .catch((error) => {
                    this.prefetchInProgress = false;
                    logger.error('Failed to prefetch countdown song:', error);
                });

            return true;
        } catch (error) {
            this.prefetchInProgress = false;
            logger.error('Failed to initiate countdown song prefetch:', error);
            return false;
        }
    }

    /**
     * Queue the countdown song as priority
     * Uses pre-fetched song if available, otherwise adds URL to queue
     * @returns {Promise<boolean>} True if song was queued
     */
    async prepareCountdownSong() {
        config._ensureSettingsLoaded();

        const songUrl = config.countdown.song?.url;
        if (!songUrl) {
            logger.warn('No countdown song URL configured');
            return false;
        }

        if (this.songQueued) {
            logger.debug('Countdown song already queued');
            return true;
        }

        try {
            const queueService = this._getQueueService();

            // Check if countdown song is already in queue
            const existingIndex = queueService.getQueue().findIndex(item =>
                item.content === songUrl || 
                item.sourceUrl === songUrl ||
                (this.prefetchedSong && item.content === this.prefetchedSong.filePath)
            );

            if (existingIndex !== -1) {
                // Move to front if not already there
                if (existingIndex > 0) {
                    queueService.move(existingIndex, 0);
                    logger.info('Moved countdown song to front of queue');
                }
                this.songQueued = true;
                return true;
            }

            // Use pre-fetched song if available, otherwise use URL
            let queueItem;
            if (this.prefetchedSong && this.prefetchedSong.sourceUrl === songUrl) {
                // Use pre-fetched file
                queueItem = {
                    content: this.prefetchedSong.filePath,
                    type: 'file',
                    sourceUrl: this.prefetchedSong.sourceUrl,
                    title: this.prefetchedSong.title || 'Countdown Song',
                    artist: this.prefetchedSong.artist || '',
                    requester: 'System',
                    isPriority: true,
                    isCountdownSong: true,
                    prefetched: true,
                };
                logger.info('Using pre-fetched countdown song:', { 
                    title: this.prefetchedSong.title,
                    filePath: this.prefetchedSong.filePath 
                });
            } else {
                // Fallback to URL (will download when played)
                queueItem = {
                    content: songUrl,
                    type: 'url',
                    title: 'Countdown Song',
                    requester: 'System',
                    isPriority: true,
                    isCountdownSong: true,
                };
                logger.info('Countdown song not prefetched, will download on play:', { url: songUrl });
            }

            // Add to front of queue
            queueService.addFirst(queueItem);
            this.songQueued = true;

            logger.info('Countdown song added to queue');
            return true;
        } catch (error) {
            logger.error('Failed to prepare countdown song:', error);
            return false;
        }
    }

    /**
     * Check if current song should be skipped and start countdown song
     * Called by background job
     */
    async checkAndExecute() {
        config._ensureSettingsLoaded();

        if (!config.countdown.enabled || !config.countdown.targetDate) {
            return;
        }

        const now = Date.now();
        const targetTime = new Date(config.countdown.targetDate).getTime();
        const songTimestamp = config.countdown.song?.timestamp || 0;
        const skipBuffer = config.countdown.skipBuffer || 5000;

        // Calculate when song should start
        const startTime = this.calculateSongStartTime(config.countdown.targetDate, songTimestamp);
        const skipTime = startTime - skipBuffer;

        // Check if we're past the countdown (already finished)
        if (now > targetTime) {
            // Countdown has passed, disable it
            if (config.countdown.enabled) {
                logger.info('Countdown has passed, disabling');
                config.countdown.enabled = false;
                config.saveSettings();
            }
            return;
        }

        const timeUntilStart = startTime - now;
        const timeUntilSkip = skipTime - now;

        // Log countdown status periodically
        if (now - this.lastCheck > 60000) { // Log every minute
            const timeRemaining = this.getTimeRemaining();
            logger.debug('Countdown status:', {
                timeRemaining: this.formatTimeRemaining(timeRemaining),
                timeUntilStart: Math.round(timeUntilStart / 1000) + 's',
                songQueued: this.songQueued,
                songStarted: this.songStarted,
            });
            this.lastCheck = now;
        }

        // At skipTime: Prepare countdown song and skip current if needed
        if (timeUntilSkip <= 0 && !this.songQueued) {
            logger.info('Skip time reached, preparing countdown song');

            const orchestrator = this._getOrchestrator();
            const currentSong = orchestrator?.currentSong;

            // Prepare the countdown song
            await this.prepareCountdownSong();

            // Skip current song if it's not the countdown song
            if (currentSong && !this._isCountdownSong(currentSong)) {
                logger.info('Skipping current song to queue countdown song');
                orchestrator.skip();
            }
        }

        // At startTime: Ensure song is playing at correct position
        if (timeUntilStart <= 0 && !this.songStarted && this.songQueued) {
            const orchestrator = this._getOrchestrator();
            const currentSong = orchestrator?.currentSong;

            if (!currentSong) {
                // No song playing, trigger playback
                logger.info('Start time reached, triggering countdown song playback');
                orchestrator.skip(); // This will start playing the next song in queue
            } else if (this._isCountdownSong(currentSong)) {
                // Countdown song is playing, verify timing
                const elapsed = currentSong.elapsed || 0;
                const expectedPosition = songTimestamp * 1000 - (targetTime - now);
                const drift = Math.abs(elapsed - expectedPosition);

                if (drift > 2000) { // More than 2 seconds off
                    logger.warn('Countdown song timing drift detected:', { drift, elapsed, expected: expectedPosition });
                    // In the future, could implement seek here
                }

                this.songStarted = true;
            }
        }
    }

    /**
     * Start the countdown checking interval
     */
    startChecking() {
        if (this.checkInterval) {
            return;
        }

        // Check every second
        this.checkInterval = setInterval(() => {
            this.checkAndExecute().catch(err => {
                logger.error('Error in countdown check:', err);
            });
        }, 1000);

        logger.info('Countdown checking started');
    }

    /**
     * Stop the countdown checking interval
     */
    stopChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            logger.info('Countdown checking stopped');
        }
    }
}

module.exports = new CountdownService();
