const EventEmitter = require('events');
const config = require('../../config');
const { logger } = require('../../utils/logger.util');
const { getThumbnailUrl } = require('../../utils/helpers.util');
const infrastructure = require('../../infrastructure');
const { isRateLimitError } = require('../../utils/rate-limit.util');
const { eventBus } = require('../../events');

// Direct requires to avoid circular dependencies
const queueService = require('./queue.service');
const shuffleService = require('./shuffle.service');
const prefetchService = require('./prefetch.service');
const downloadOrchestratorService = require('./download-orchestrator.service');
const songPreparationService = require('./song-preparation.service');
const repeatModeService = require('./repeat-mode.service');
const playbackStateService = require('../system/playback-state.service');
const statsService = require('../system/stats.service');
const notificationService = require('../system/notification.service');
const cleanupService = require('../system/cleanup.service');
const sessionService = require('../system/session.service');
const {
    QUEUE_ITEM_ADDED,
    PLAYBACK_REQUESTED,
    PLAYBACK_STARTED,
    PLAYBACK_FINISHED,
    PLAYBACK_ERROR,
    PLAYBACK_PAUSE,
    PLAYBACK_RESUME,
    PLAYBACK_SEEK,
    PLAYBACK_SKIP,
    PLAYBACK_ENDED,
    QUEUE_UPDATED
} = require('../../events');

/**
 * PlaybackOrchestrator
 *
 * Orchestrates playback workflow - handles downloads, notifications, cleanup, and auto-play logic.
 * Manages playback state and coordinates between QueueManager and Player.
 */
class PlaybackOrchestrator extends EventEmitter {
    constructor() {
        super();

        // Initialize with default values (state will be loaded later via loadState() after database is initialized)
        this.isPlaying = false;
        this.isPaused = false;
        this.currentSong = null;
        this.songsPlayed = 0;

        // Runtime-only state (not persisted)
        this.isSeeking = false;

        // Prevent duplicate playback finished handling
        this.isHandlingPlaybackFinished = false;
        this.processNextTimeout = null;
        this.isProcessing = false; // Track if we're currently processing an item

        // Event listeners are now set up via centralized listener registry
    }

    /**
     * Load state from state service (called after database is initialized)
     */
    loadState() {
        if (!playbackStateService) {
            return;
        }
        const persistedState = playbackStateService.load();
        this.isPlaying = persistedState.isPlaying;
        this.isPaused = persistedState.isPaused;
        this.currentSong = persistedState.currentSong;
        this.songsPlayed = persistedState.songsPlayed;
    }

    /**
     * Emit state changed event and persist state
     * State persistence is handled by PlaybackStateService
     */
    emitStateChanged() {
        // Update state service and trigger save (with debouncing)
        playbackStateService.save({
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            currentSong: this.currentSong,
            songsPlayed: this.songsPlayed
        });
        
        // Emit QUEUE_UPDATED to trigger SSE broadcast for real-time UI updates
        // This ensures download progress and playback state changes are immediately visible
        eventBus.emit(QUEUE_UPDATED);
    }

    /**
     * Set up internal event listeners for state management
     * These listen to events from the bus and update internal state
     * Note: Cross-component listeners are registered in the centralized listener registry
     */
    setupInternalListeners() {
        const playbackLogger = logger.child({ component: 'playback' });
        
        // Listen for playback started from Player (via bus) - update state
        eventBus.on(PLAYBACK_STARTED, ({ filePath }) => {
            // When playback actually starts, ensure state is correct
            if (this.currentSong) {
                this.isPlaying = true;
                this.isPaused = false;
                this.emitStateChanged();
                
                playbackLogger.info({
                    context: {
                        event: 'playback_started',
                        songTitle: this.currentSong.title || this.currentSong.content,
                        songId: this.currentSong.id,
                        filePath,
                        requester: this.currentSong.sender
                    }
                }, 'Playback started');
            }
        });

        // Listen for playback finished from Player (via bus)
        eventBus.on(PLAYBACK_FINISHED, ({ filePath, reason }) => {
            if (this.currentSong) {
                const durationPlayed = this.currentSong.startTime 
                    ? Math.floor((Date.now() - this.currentSong.startTime) / 1000)
                    : 0;
                
                playbackLogger.info({
                    context: {
                        event: 'playback_finished',
                        songTitle: this.currentSong.title || this.currentSong.content,
                        songId: this.currentSong.id,
                        reason,
                        durationPlayed,
                        filePath
                    }
                }, `Playback finished: ${reason}`);
            }
            
            // Pass reason to handlePlaybackFinished so it knows if it was skipped
            this.handlePlaybackFinished(reason !== 'error', reason);
        });

        // Listen for playback errors from Player (via bus)
        eventBus.on(PLAYBACK_ERROR, ({ filePath, error }) => {
            playbackLogger.error({
                context: {
                    event: 'playback_error',
                    songTitle: this.currentSong?.title || this.currentSong?.content || 'Unknown',
                    songId: this.currentSong?.id,
                    filePath,
                    error: {
                        message: error?.message,
                        stack: error?.stack,
                        name: error?.name
                    }
                }
            }, 'Playback error:', error);
            this.handlePlaybackFinished(false, 'error');
        });
    }

    /**
     * Process next item in queue
     */
    async processNext() {
        const queue = queueService.getQueue();
        // Prevent concurrent processing attempts
        if (this.isPlaying || this.isProcessing || queue.length === 0) {
            return;
        }

        // Set flags immediately to prevent concurrent processing attempts
        this.isPlaying = true;
        this.isProcessing = true;

        // Clear any pending processNext timeout since we're processing now
        if (this.processNextTimeout) {
            clearTimeout(this.processNextTimeout);
            this.processNextTimeout = null;
        }

        // Use shuffle if enabled
        const config = require('../../config');
        config._ensureSettingsLoaded();
        const shuffleEnabled = config.playback.shuffleEnabled;

        let selectedItem;
        let selectedIndex;

        if (shuffleEnabled) {
            selectedIndex = shuffleService.selectShuffledItem(queue);
            selectedItem = queue[selectedIndex];
        } else {
            selectedIndex = 0;
            selectedItem = queue[0];
        }

        const playbackLogger = logger.child({
            component: 'playback',
            context: {
                queuePosition: selectedIndex,
                queueSize: queue.length,
                shuffleEnabled,
                repeatMode: config.playback.repeatMode
            }
        });
        
        playbackLogger.info({
            context: {
                songTitle: selectedItem.title || selectedItem.content,
                songId: selectedItem.id,
                requester: selectedItem.sender,
                source: selectedItem.type
            }
        }, `Processing queue item: "${selectedItem.title || selectedItem.content}"`);

        await this.playItem(selectedItem, selectedIndex);
    }

    /**
     * Play a queue item (download if needed, then emit playback_requested)
     * @param {Object} item - Queue item to play
     * @param {number} [itemIndex] - Optional index of item in queue (for shuffle mode)
     */
    async playItem(item, itemIndex = null) {
        const playbackLogger = logger.child({
            component: 'playback',
            context: {
                songId: item.id,
                songTitle: item.title || item.content,
                requester: item.sender,
                groupId: item.remoteJid,
                source: item.type
            }
        });
        
        const playStartTime = Date.now();
        
        try {
            playbackLogger.debug('Starting playback preparation');
            
            let filePath;
            let title = 'Audio';

            // Prefetch next songs in background (respects configured prefetchCount)
            prefetchService.prefetchNext().catch(err => {
                playbackLogger.warn({
                    context: { error: err.message }
                }, 'Prefetch error:', err);
            });

            // Check if item was prefetched but type wasn't updated yet
            const { isFilePath } = require('../../utils/url.util');
            const wasPrefetched = item.prefetched || (item.content && isFilePath(item.content));
            
            if (item.type === 'url' && !wasPrefetched) {
                playbackLogger.debug('Downloading song from URL');
                
                // Set as current song BEFORE download starts so UI can show download progress
                this.currentSong = {
                    ...item,
                    startTime: Date.now(),
                    pausedAt: null
                };
                this.emitStateChanged();
                
                const downloadStartTime = Date.now();
                
                // Download and prepare the song with progress callback to update currentSong
                const downloadResult = await downloadOrchestratorService.downloadAndPrepare(item, (progress) => {
                    // Sync download progress to currentSong for real-time UI updates
                    if (this.currentSong) {
                        this.currentSong.downloadStatus = item.downloadStatus;
                        this.currentSong.downloadProgress = item.downloadProgress;
                        this.currentSong.downloading = item.downloading;
                        this.emitStateChanged(); // Emit update to trigger SSE broadcast
                    }
                });
                filePath = downloadResult.filePath;
                title = downloadResult.title;
                
                const downloadDuration = Date.now() - downloadStartTime;
                playbackLogger.info({
                    context: {
                        downloadDuration,
                        fileSize: downloadResult.fileSize,
                        sourceUrl: item.content
                    }
                }, 'Song downloaded successfully');

                // Prepare the song (update metadata, volume normalization, etc.)
                const prepareStartTime = Date.now();
                const preparedItem = await songPreparationService.prepareSong(item, { 
                    filePath, 
                    title, 
                    artist: downloadResult.artist || item.artist || '',
                    thumbnailPath: downloadResult.thumbnailPath || item.thumbnail || null
                }, item.content);
                Object.assign(item, preparedItem);
                
                const prepareDuration = Date.now() - prepareStartTime;
                playbackLogger.debug({
                    context: { prepareDuration }
                }, 'Song preparation completed');
            } else if (item.type === 'file' || wasPrefetched) {
                // Use file path - either explicitly marked as file or was prefetched
                filePath = item.content;
                title = item.title || 'User Attachment';
                if (wasPrefetched && item.type === 'url') {
                    playbackLogger.debug('Using prefetched file for playback (type was not updated yet)');
                    // Update type to reflect actual state
                    item.type = 'file';
                } else {
                    playbackLogger.debug('Using local file for playback');
                }
            }

            if (filePath && require('fs').existsSync(filePath)) {
                // Reset playback finished flag since we're starting a new song
                this.isHandlingPlaybackFinished = false;

                // Update current song with final state (if not already set for URL downloads)
                const isNewSong = !this.currentSong || this.currentSong.content !== item.content;
                if (!this.currentSong || this.currentSong.content !== item.content) {
                    // Clear repeat tracking when starting a new song
                    repeatModeService.clearRepeatOneTracking(null);
                    
                    this.currentSong = {
                        ...item,
                        startTime: Date.now(),
                        pausedAt: null
                    };
                } else {
                    // Update existing currentSong with final item state
                    Object.assign(this.currentSong, {
                        ...item,
                        startTime: this.currentSong.startTime || Date.now(),
                        pausedAt: null
                    });
                }
                this.emitStateChanged();

                // Record song in stats
                statsService.recordSongPlayed(this.currentSong);

                // Send notification via notification service
                if (item.remoteJid) {
                    const artistText = item.artist ? `\n👤 *${item.artist}*` : '';
                    await notificationService.sendPlaybackNotification(
                        item.remoteJid,
                        `▶️ *Now Playing*\n\n🎶 *${title}*${artistText}`,
                        item.sender
                    );
                }

                const totalPrepTime = Date.now() - playStartTime;
                playbackLogger.info({
                    context: {
                        filePath,
                        preparationTime: totalPrepTime,
                        artist: item.artist || 'Unknown',
                        duration: item.duration || 'Unknown'
                    }
                }, `Playing song: "${title}"`);

                // Remove item from queue (it's now playing)
                queueService.removePlayingItem(item, itemIndex);

                // Emit playback_requested event to Player via bus
                eventBus.emit(PLAYBACK_REQUESTED, { filePath, startOffset: 0 });
                
                // Clear processing flag since we've successfully started playback
                this.isProcessing = false;
            } else {
                playbackLogger.error({
                    context: {
                        filePath: filePath || 'no file path',
                        error: 'File not found or download failed'
                    }
                }, `File not found or download failed for "${item.title || item.content}"`);
                
                // Reset flags since we're not actually playing
                this.isPlaying = false;
                this.isProcessing = false;
                
                // Determine if we should remove the item or mark for re-download
                const hasSourceUrl = item.sourceUrl && (item.sourceUrl.startsWith('http://') || item.sourceUrl.startsWith('https://'));
                const isFileType = item.type === 'file';
                
                if (isFileType && hasSourceUrl) {
                    // File is missing but we have a source URL - mark for re-download
                    playbackLogger.warn({
                        context: {
                            event: 'marking_for_redownload',
                            songTitle: item.title || item.content,
                            songId: item.id,
                            sourceUrl: item.sourceUrl
                        }
                    }, `File missing, marking for re-download: "${item.title || item.content}"`);
                    
                    item.type = 'url';
                    item.content = item.sourceUrl;
                    item.downloadStatus = 'pending';
                    item.downloadProgress = 0;
                    item.prefetched = false;
                    queueService.saveQueue(true);
                    
                    if (item.remoteJid) {
                        await notificationService.sendPlaybackNotification(
                            item.remoteJid,
                            '⏳ *Re-downloading*\n\nFile was missing, attempting to download again.',
                            item.sender
                        );
                    }
                } else {
                    // No source URL or already a URL type - remove from queue to prevent infinite retry loop
                    playbackLogger.warn({
                        context: {
                            event: 'removing_failed_song',
                            songTitle: item.title || item.content,
                            songId: item.id,
                            reason: hasSourceUrl ? 'Download failed' : 'File missing and no source URL'
                        }
                    }, `Removing song from queue: "${item.title || item.content}" - File not found or download failed`);
                    
                    // Remove the item from the queue
                    if (item.id) {
                        queueService.removeById(item.id);
                    } else if (itemIndex !== null) {
                        queueService.remove(itemIndex);
                    } else {
                        // Fallback: find and remove by content/title
                        const queue = queueService.getQueue();
                        const indexToRemove = queue.findIndex(qItem => 
                            (qItem.id === item.id) ||
                            (qItem.content === item.content && qItem.type === item.type) ||
                            (qItem.title === item.title && qItem.artist === item.artist)
                        );
                        if (indexToRemove !== -1) {
                            queueService.remove(indexToRemove);
                        }
                    }
                    
                    if (item.remoteJid) {
                        await notificationService.sendPlaybackNotification(
                            item.remoteJid,
                            '❌ *Playback Failed*\n\nCouldn\'t play this song.\n\n💡 The file may be corrupted or unavailable.',
                            item.sender
                        );
                    }
                }
                
                // Wait before processing next to prevent immediate retry loop
                await new Promise(resolve => setTimeout(resolve, config.playback.songTransitionDelay));
                
                // Process next item if available
                const updatedQueue = queueService.getQueue();
                if (updatedQueue.length > 0 && !this.isProcessing) {
                    this.handlePlaybackFinished(false);
                } else {
                    // No items left - just reset state
                    this.isPlaying = false;
                    this.isProcessing = false;
                }
                return;
            }
        } catch (error) {
            // Log full error details
            const errorMessage = error?.message || error?.toString() || String(error) || 'Unknown error';
            const errorStack = error?.stack || '';
            logger.error(`Error processing queue item "${item.title || item.content}": ${errorMessage}`);
            if (errorStack) {
                logger.error('Error stack:', errorStack);
            }
            // Log the full error object for debugging
            logger.error('Full error object:', error);

            // Check if this is a "No results found on YouTube" error
            // If so, remove the item from the queue to prevent infinite retry loops
            const isYouTubeNotFoundError = errorMessage.includes('No results found on YouTube');
            
            if (isYouTubeNotFoundError) {
                playbackLogger.warn({
                    context: {
                        event: 'removing_unfindable_song',
                        songTitle: item.title || item.content,
                        songId: item.id,
                        reason: 'No results found on YouTube'
                    }
                }, `Removing song from queue: "${item.title || item.content}" - No results found on YouTube`);
                
                // Remove the item from the queue
                if (item.id) {
                    queueService.removeById(item.id);
                } else if (itemIndex !== null) {
                    queueService.remove(itemIndex);
                } else {
                    // Fallback: find and remove by content/title
                    const queue = queueService.getQueue();
                    const indexToRemove = queue.findIndex(qItem => 
                        (qItem.id === item.id) ||
                        (qItem.content === item.content && qItem.type === item.type) ||
                        (qItem.title === item.title && qItem.artist === item.artist)
                    );
                    if (indexToRemove !== -1) {
                        queueService.remove(indexToRemove);
                    }
                }
            }

            if (item.remoteJid) {
                await notificationService.sendPlaybackNotification(
                    item.remoteJid,
                    `❌ *Error*\n\n*${errorMessage}*\n\n💡 Please try again or choose a different song.`,
                    item.sender
                );
            }

            // Reset flags - mark as failed
            this.isPlaying = false;
            this.isProcessing = false;
            
            // If we removed the item due to YouTube not found error, skip the delay and go straight to next
            if (isYouTubeNotFoundError) {
                // Process next item immediately (no delay needed since we removed the problematic item)
                const updatedQueue = queueService.getQueue();
                if (updatedQueue.length > 0 && !this.isProcessing) {
                    this.handlePlaybackFinished(false);
                } else {
                    // No items left - just reset state
                    this.isPlaying = false;
                    this.isProcessing = false;
                }
            } else {
                // Wait before retrying to prevent immediate retry loop
                await new Promise(resolve => setTimeout(resolve, config.playback.songTransitionDelay));
                
                // Only retry if queue still has items and we're not already processing
                const updatedQueue = queueService.getQueue();
                if (updatedQueue.length > 0 && !this.isProcessing) {
                    this.handlePlaybackFinished(false);
                } else {
                    // No items left or already processing - just reset state
                    this.isPlaying = false;
                    this.isProcessing = false;
                }
            }
        }
    }

    /**
     * Handle playback finished (called by Player via event)
     * @param {boolean} success - Whether playback was successful (not an error)
     * @param {string} reason - Reason for finishing ('ended', 'skipped', 'error')
     */
    async handlePlaybackFinished(success = true, reason = 'ended') {
        // Prevent duplicate calls
        if (this.isHandlingPlaybackFinished) {
            logger.debug('handlePlaybackFinished already in progress, ignoring duplicate call');
            return;
        }

        this.isHandlingPlaybackFinished = true;

        // Clear any pending processNext timeout
        if (this.processNextTimeout) {
            clearTimeout(this.processNextTimeout);
            this.processNextTimeout = null;
        }

        const config = require('../../config');
        config._ensureSettingsLoaded();
        const repeatMode = config.playback.repeatMode;

        // Don't handle repeat modes for skipped songs
        if (reason === 'skipped') {
            // Just move to next song without tracking for repeat
            this.isPlaying = false;
            this.isPaused = false;
            
            // Cleanup after playback
            if (this.currentSong) {
                cleanupService.cleanupAfterPlayback(this.currentSong, config);
            }
            
            this.currentSong = null;
            this.emitStateChanged();

            // Small delay to ensure broadcast completes before processing next song
            setTimeout(() => {
                // Emit playback ended event via bus
                eventBus.emit(PLAYBACK_ENDED, { success: false });

                // Process next item if available
                const updatedQueue = queueService.getQueue();
                if (updatedQueue.length > 0 && !this.isProcessing) {
                    this.processNextTimeout = setTimeout(() => {
                        this.processNextTimeout = null;
                        this.isHandlingPlaybackFinished = false;
                        this.processNext();
                    }, config.playback.songTransitionDelay);
                } else {
                    // No more songs or already processing, reset flag immediately
                    this.isHandlingPlaybackFinished = false;
                }
            }, 50); // Small delay to ensure broadcast is sent
            return;
        }

        // Handle repeat one mode - restart current song
        if (repeatModeService.shouldRestartSong(repeatMode, this.currentSong, success)) {
            const handled = await repeatModeService.handleRepeatOne(
                this.currentSong,
                ({ filePath, startOffset }) => eventBus.emit(PLAYBACK_REQUESTED, { filePath, startOffset }),
                () => this.emitStateChanged(),
                config
            );
            if (handled) {
                // Reset the handling flag since repeat one will call processNextTimeout
                this.isHandlingPlaybackFinished = false;
                return;
            }
        }

        // For repeat all mode, track the finished song (only if it actually finished, not skipped)
        repeatModeService.trackSongForRepeatAll(this.currentSong, success);

        this.isPlaying = false;
        this.isPaused = false;

        // Cleanup after playback if configured (but not for repeat one, which returns early)
        if (this.currentSong && repeatMode !== 'one') {
            cleanupService.cleanupAfterPlayback(this.currentSong, config);
        }

        // Clear repeat one tracking when song finishes (if it wasn't repeated)
        const finishedSong = this.currentSong;
        this.currentSong = null;
        if (finishedSong) {
            repeatModeService.clearRepeatOneTracking(null);
        }
        if (success) {
            this.songsPlayed++;
        }
        this.emitStateChanged();

        // Emit playback ended event via bus
        eventBus.emit(PLAYBACK_ENDED, { success });

        // Handle repeat all mode ONLY if queue is empty
        const updatedQueue = queueService.getQueue();
        if (updatedQueue.length === 0) {
            await repeatModeService.handleRepeatAll(config);
        }

        // Process next item if available (check queue again in case repeat all added songs)
        const finalQueue = queueService.getQueue();
        if (finalQueue.length > 0 && !this.isProcessing) {
            this.processNextTimeout = setTimeout(() => {
                this.processNextTimeout = null;
                this.isHandlingPlaybackFinished = false;
                this.processNext();
            }, config.playback.songTransitionDelay);
        } else {
            // No more songs or already processing, reset flag immediately
            this.isHandlingPlaybackFinished = false;
        }
    }


    /**
     * Pause playback
     */
    pause() {
        if (this.isPlaying && !this.isPaused && this.currentSong) {
            this.isPaused = true;
            this.currentSong.pausedAt = Date.now();
            eventBus.emit(PLAYBACK_PAUSE);
            this.emitStateChanged();
            return true;
        }
        return false;
    }

    /**
     * Resume playback
     */
    resume() {
        if (this.isPlaying && this.isPaused && this.currentSong) {
            this.isPaused = false;
            this.currentSong.startTime = Date.now() - (this.currentSong.pausedAt - this.currentSong.startTime);
            this.currentSong.pausedAt = null;
            eventBus.emit(PLAYBACK_RESUME);
            this.emitStateChanged();
            return true;
        }
        return false;
    }

    /**
     * Seek to position in current song
     */
    seek(timeMs) {
        if (this.isPlaying && this.currentSong && timeMs >= 0) {
            this.isSeeking = true;
            
            // Update startTime so elapsed calculation reflects the new position
            // elapsed = Date.now() - startTime, so startTime = Date.now() - timeMs
            this.currentSong.startTime = Date.now() - timeMs;
            
            // If paused, update pausedAt to maintain correct elapsed calculation
            // elapsed = pausedAt - startTime, so pausedAt = startTime + timeMs = Date.now()
            if (this.isPaused) {
                this.currentSong.pausedAt = Date.now();
            } else {
                // Clear pausedAt if we're playing (not paused)
                this.currentSong.pausedAt = null;
            }
            
            // Emit state changed to update UI immediately
            this.emitStateChanged();
            
            eventBus.emit(PLAYBACK_SEEK, { positionMs: timeMs });
            return true;
        }
        return false;
    }

    /**
     * Skip current song
     */
    skip() {
        if (this.isPlaying || this.currentSong) {
            eventBus.emit(PLAYBACK_SKIP);
            // Trigger immediate status update
            this.emitStateChanged();
            return true;
        }
        return false;
    }

    /**
     * Reset session
     */
    resetSession() {
        return sessionService.resetSession(this, statsService);
    }

    /**
     * Get current song
     */
    getCurrent() {
        return this.currentSong;
    }

    /**
     * Validate and clear currentSong if file no longer exists
     * Called after cleanup operations to ensure consistency
     */
    validateCurrentSong() {
        if (this.currentSong && this.currentSong.content) {
            const fileExists = require('fs').existsSync(this.currentSong.content);
            if (!fileExists) {
                // File no longer exists - clear currentSong and reset playback state
                this.currentSong = null;
                this.isPlaying = false;
                this.isPaused = false;
                // Clear playback state in database
                try {
                    playbackStateService.save({
                        current_song_id: null,
                        is_playing: 0,
                        is_paused: 0
                    });
                } catch (e) {
                    logger.error('Failed to clear playback state after validation:', e);
                }
                this.emitStateChanged();
            }
        }
    }

    /**
     * Prefetch all songs in queue
     */
    async prefetchAll() {
        logger.info('Starting prefetch for all queued songs...');
        await prefetchService.prefetchNext(0);
    }
}

module.exports = new PlaybackOrchestrator();

