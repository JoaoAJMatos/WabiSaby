const EventEmitter = require('events');
const fs = require('fs');
const config = require('../config');
const { logger } = require('../utils/logger.util');
const { sendMessageWithMention, getThumbnailUrl } = require('../utils/helpers.util');
const queueManager = require('./queue');
const { downloadTrack } = require('../services/download.service');
const statsService = require('../services/stats.service');
const dbService = require('../database/db.service');
const { isRateLimitError } = require('../utils/rate-limit.util');
const PlaybackStatePersistence = require('./playback-state-persistence');
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
} = require('./events');

/**
 * PlaybackController
 * 
 * Orchestrates playback workflow - handles downloads, notifications, cleanup, and auto-play logic.
 * Manages playback state and coordinates between QueueManager and Player.
 */
class PlaybackController extends EventEmitter {
    constructor() {
        super();
        
        // Playback state
        this.isPlaying = false;
        this.isPaused = false;
        this.isSeeking = false;
        this.currentSong = null;
        this.songsPlayed = 0;
        this.whatsappSocket = null;
        this.isConnected = false;
        
        // Prefetch state
        this.isPrefetching = false;
        this.downloadingUrls = new Set();
        this.prefetchRateLimitDelay = 2000;
        this.lastPrefetchTime = 0;
        this.MAX_CONCURRENT_PREFETCHES = 2;
        this.activePrefetchCount = 0;
        
        // Prevent duplicate playback finished handling
        this.isHandlingPlaybackFinished = false;
        this.processNextTimeout = null;
        
        // Repeat mode state
        this.playedQueue = []; // Track played songs for repeat all mode
        
        // Load state from database
        this.loadState();
        
        // Set up event listeners
        this.setupListeners();
        
        // Initialize state persistence handler
        this.statePersistence = new PlaybackStatePersistence(this);
    }
    
    /**
     * Load playback state from database
     */
    loadState() {
        try {
            const playbackState = dbService.getPlaybackState();
            if (playbackState) {
                this.isPlaying = playbackState.is_playing === 1;
                this.isPaused = playbackState.is_paused === 1;
                this.songsPlayed = playbackState.songs_played || 0;
                
                // Load current song if exists
                if (playbackState.current_song_id) {
                    const song = dbService.getSong(playbackState.current_song_id);
                    if (song) {
                        // Check if file exists - if not, don't restore currentSong
                        const fileExists = song.content && fs.existsSync(song.content);
                        
                        // Only restore currentSong if file exists
                        if (fileExists) {
                            // Determine type: if content is a file path (not a URL), it's a file
                            const isFile = song.content && !song.content.startsWith('http://') && !song.content.startsWith('https://');
                            
                            // Calculate the elapsed time when playback was stopped
                            let elapsedTime = 0;
                            if (playbackState.start_time) {
                                if (playbackState.paused_at) {
                                    // Was paused - use paused_at time
                                    elapsedTime = playbackState.paused_at - playbackState.start_time;
                                } else {
                                    // Was playing - calculate from start_time to now (but we'll set it as paused)
                                    elapsedTime = Math.floor(Date.now() / 1000) - playbackState.start_time;
                                }
                            }
                            
                            // Always restore in paused state (stopped) - user must click play to resume
                            this.isPlaying = false;
                            this.isPaused = true;
                            
                            this.currentSong = {
                                content: song.content,
                                title: song.title,
                                artist: song.artist,
                                channel: song.channel,
                                duration: song.duration,
                                thumbnail: song.thumbnail_path,
                                thumbnailUrl: song.thumbnail_url,
                                type: isFile ? 'file' : 'url',
                                startTime: playbackState.start_time ? playbackState.start_time * 1000 : Date.now(),
                                pausedAt: playbackState.paused_at ? playbackState.paused_at * 1000 : (elapsedTime > 0 ? Date.now() - (elapsedTime * 1000) : null),
                                isPaused: true // Always start paused
                            };
                        } else {
                            // File doesn't exist - clear currentSong and reset playback state
                            this.currentSong = null;
                            this.isPlaying = false;
                            this.isPaused = false;
                            // Clear playback state in database
                            try {
                                dbService.updatePlaybackState({
                                    current_song_id: null,
                                    is_playing: 0,
                                    is_paused: 0
                                });
                            } catch (e) {
                                logger.error('Failed to clear playback state:', e);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            logger.error('Failed to load playback state:', e);
        }
    }
    
    /**
     * Emit state changed event for persistence
     * State persistence is handled by PlaybackStatePersistence listener
     */
    emitStateChanged() {
        this.emit('state_changed');
    }
    
    /**
     * Set up event listeners
     */
    setupListeners() {
        // Listen for queue items added - auto-play if not playing
        queueManager.on(QUEUE_ITEM_ADDED, ({ item }) => {
            if (!this.isPlaying && queueManager.getQueue().length > 0) {
                this.processNext();
            }
            
            // Start prefetching in background
            this.prefetchNext().catch(err => logger.error('Auto-prefetch error:', err));
        });
        
        // Listen for queue updates to trigger prefetch
        queueManager.on(QUEUE_UPDATED, () => {
            this.prefetchNext().catch(err => logger.error('Prefetch error:', err));
        });
        
        // Listen for playback finished from Player
        this.on(PLAYBACK_FINISHED, ({ filePath, reason }) => {
            this.handlePlaybackFinished(reason !== 'error');
        });
        
        // Listen for playback errors from Player
        this.on(PLAYBACK_ERROR, ({ filePath, error }) => {
            logger.error('Playback error:', error);
            this.handlePlaybackFinished(false);
        });
    }
    
    /**
     * Initialize with WhatsApp socket and connection status
     */
    initialize(sock, isConnected) {
        this.whatsappSocket = sock;
        this.isConnected = isConnected;
    }
    
    /**
     * Select a random item from queue using weighted selection
     * VIP songs have 3x higher probability than regular songs
     * @param {Array} queue - Queue array
     * @returns {number} Index of selected item
     */
    selectShuffledItem(queue) {
        if (queue.length === 0) {
            return -1;
        }
        
        if (queue.length === 1) {
            return 0;
        }
        
        // Calculate weights: VIP = 3, regular = 1
        const weights = queue.map(item => item.isPriority ? 3 : 1);
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        
        // Generate random number between 0 and totalWeight
        let random = Math.random() * totalWeight;
        
        // Select item based on weighted probability
        for (let i = 0; i < queue.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return i;
            }
        }
        
        // Fallback to last item (shouldn't happen, but safety)
        return queue.length - 1;
    }
    
    /**
     * Process next item in queue
     */
    async processNext() {
        const queue = queueManager.getQueue();
        if (this.isPlaying || queue.length === 0) {
            return;
        }
        
        // Clear any pending processNext timeout since we're processing now
        if (this.processNextTimeout) {
            clearTimeout(this.processNextTimeout);
            this.processNextTimeout = null;
        }
        
        this.isPlaying = true;
        this.isPaused = false;
        
        const config = require('../config');
        config._ensureSettingsLoaded();
        const shuffleEnabled = config.playback.shuffleEnabled;
        
        let selectedIndex;
        if (shuffleEnabled) {
            selectedIndex = this.selectShuffledItem(queue);
            logger.info(`Shuffle mode: selected item at index ${selectedIndex} from queue of ${queue.length} items`);
        } else {
            selectedIndex = 0;
        }
        
        const queueItem = queue[selectedIndex];
        
        if (!queueItem) {
            logger.warn(`No queue item found at index ${selectedIndex} (queue length: ${queue.length})`);
            this.isPlaying = false;
            return;
        }
        
        logger.info(`Processing queue item: "${queueItem.title || queueItem.content}" at index ${selectedIndex} (shuffle: ${shuffleEnabled})`);
        
        await this.playItem(queueItem, selectedIndex);
    }
    
    /**
     * Play a queue item (download if needed, then emit playback_requested)
     * @param {Object} item - Queue item to play
     * @param {number} [itemIndex] - Optional index of item in queue (for shuffle mode)
     */
    async playItem(item, itemIndex = null) {
        try {
            let filePath;
            let title = 'Audio';
            
            // Prefetch next songs in background (respects configured prefetchCount)
            this.prefetchNext().catch(err => logger.error('Prefetch error', err));
            
            if (item.type === 'url') {
                item.downloadStatus = 'preparing';
                item.downloadProgress = 0;
                queueManager.saveQueue(true);
                
                const originalUrl = item.content; // Store original URL before download
                const result = await downloadTrack(item.content, (progress) => {
                    item.downloadProgress = progress.percent || 0;
                    item.downloadStatus = progress.status || 'downloading';
                    queueManager.saveQueue(true);
                });
                
                filePath = result.filePath;
                title = result.title;
                
                // Update stats with thumbnail
                if (result.thumbnailPath) {
                    const thumbnailUrl = getThumbnailUrl(result.thumbnailPath);
                    if (thumbnailUrl) {
                        statsService.updateLastSong(item.content, { thumbnailUrl });
                    }
                }
                
                // Update song record in database: set content to file path and preserve original URL as source_url
                const dbService = require('../database/db.service');
                if (item.songId) {
                    // Update the song record directly by ID
                    dbService.updateSong(item.songId, {
                        content: filePath, // Update content to file path
                        source_url: originalUrl, // Preserve original URL
                        title: result.title,
                        artist: result.artist,
                        thumbnail_path: result.thumbnailPath,
                        thumbnail_url: result.thumbnailPath ? getThumbnailUrl(result.thumbnailPath) : null
                    });
                    
                    // Analyze audio and store volume gain (async, non-blocking)
                    const volumeNormalization = require('../services/volume-normalization.service');
                    const settings = volumeNormalization.getNormalizationSettings();
                    if (settings.enabled) {
                        volumeNormalization.analyzeAndStoreGain(item.songId, filePath)
                            .catch(err => {
                                logger.error('Volume normalization analysis failed (non-blocking):', err);
                            });
                    }
                }
                
                item.type = 'file';
                item.content = filePath;
                item.sourceUrl = originalUrl; // Keep in memory for reference
                item.thumbnail = result.thumbnailPath;
                item.downloadStatus = 'ready';
                item.downloadProgress = 100;
                queueManager.saveQueue(true);
            } else if (item.type === 'file') {
                filePath = item.content;
                title = item.title || 'User Attachment';
            }
            
            if (filePath && fs.existsSync(filePath)) {
                // Reset playback finished flag since we're starting a new song
                this.isHandlingPlaybackFinished = false;
                
                // Set as current song
                this.currentSong = {
                    ...item,
                    startTime: Date.now(),
                    pausedAt: null
                };
                this.emitStateChanged();
                
                // Record song in stats
                statsService.recordSongPlayed(this.currentSong);
                
                // Send notification if connected
                if (this.isConnected && item.remoteJid && item.remoteJid !== 'WEB_DASHBOARD') {
                    try {
                        const artistText = item.artist ? `\n👤 *${item.artist}*` : '';
                        await sendMessageWithMention(this.whatsappSocket, item.remoteJid, `▶️ *Now Playing*\n\n🎶 *${title}*${artistText}`, item.sender);
                    } catch (e) {
                        logger.warn('Failed to send playing notification:', e.message);
                    }
                }
                
                logger.info(`Playing locally: ${filePath}`);
                
                // Remove item from queue (it's now playing)
                const queue = queueManager.getQueue();
                if (queue.length > 0) {
                    // If itemIndex is provided (shuffle mode), use it directly
                    if (itemIndex !== null && itemIndex >= 0 && itemIndex < queue.length) {
                        const itemAtIndex = queue[itemIndex];
                        // Verify the item matches (by ID if available)
                        const matches = (item.id && itemAtIndex.id) 
                            ? (itemAtIndex.id === item.id)
                            : (itemAtIndex === item);
                        
                        if (matches) {
                            queueManager.remove(itemIndex);
                        } else {
                            // Item at index doesn't match, fall back to ID search
                            const index = queue.findIndex(q => q.id === item.id);
                            if (index !== -1) {
                                logger.warn(`Queue item mismatch at provided index ${itemIndex}, found at ${index} (id: ${item.id})`);
                                queueManager.remove(index);
                            } else {
                                logger.error(`Failed to remove item from queue: item not found (id: ${item.id}, title: ${item.title || 'unknown'})`);
                            }
                        }
                    } else {
                        // No index provided (normal FIFO mode) - remove first item
                        const firstItem = queue[0];
                        // Verify that the first item matches what we're playing (by ID if available)
                        const matches = (item.id && firstItem.id) 
                            ? (firstItem.id === item.id)
                            : (firstItem === item);
                        
                        if (matches) {
                            queueManager.remove(0);
                        } else if (item.id) {
                            // Fallback: try to find by ID if first item doesn't match
                            const index = queue.findIndex(q => q.id === item.id);
                            if (index !== -1) {
                                logger.warn(`Queue item mismatch: expected first item but found at index ${index} (id: ${item.id})`);
                                queueManager.remove(index);
                            } else {
                                logger.error(`Failed to remove item from queue: item not found (id: ${item.id}, title: ${item.title || 'unknown'})`);
                            }
                        } else {
                            // No ID available - this shouldn't happen, but try to remove first item anyway
                            logger.warn(`Removing first queue item without ID verification (title: ${item.title || 'unknown'})`);
                            queueManager.remove(0);
                        }
                    }
                }
                
                // Emit playback_requested event to Player
                this.emit(PLAYBACK_REQUESTED, { filePath, startOffset: 0 });
            } else {
                logger.error('File not found or download failed');
                if (this.isConnected && item.remoteJid && item.remoteJid !== 'WEB_DASHBOARD') {
                    try {
                        await sendMessageWithMention(this.whatsappSocket, item.remoteJid, '❌ *Playback Failed*\n\nCouldn\'t play this song.\n\n💡 The file may be corrupted or unavailable.', item.sender);
                    } catch (e) { }
                }
                // Mark as failed
                await new Promise(resolve => setTimeout(resolve, config.playback.songTransitionDelay));
                this.handlePlaybackFinished(false);
                return;
            }
        } catch (error) {
            logger.error('Error processing queue item:', error);
            
            if (this.isConnected && item.remoteJid && item.remoteJid !== 'WEB_DASHBOARD') {
                try {
                    await sendMessageWithMention(this.whatsappSocket, item.remoteJid, `❌ *Error*\n\n*${error.message}*\n\n💡 Please try again or use a different song.`, item.sender);
                } catch (e) { }
            }
            
            // Mark as failed
            await new Promise(resolve => setTimeout(resolve, config.playback.songTransitionDelay));
            this.handlePlaybackFinished(false);
        }
    }
    
    /**
     * Handle playback finished (called by Player via event)
     */
    handlePlaybackFinished(success = true) {
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
        
        const config = require('../config');
        config._ensureSettingsLoaded();
        const repeatMode = config.playback.repeatMode;
        
        // Handle repeat one mode - restart current song
        if (repeatMode === 'one' && this.currentSong && success) {
            const filePath = this.currentSong.content;
            if (filePath && fs.existsSync(filePath)) {
                // Don't clear currentSong, don't increment songsPlayed, don't cleanup
                // Just restart playback
                logger.info(`Repeat one: restarting current song "${this.currentSong.title || 'Unknown'}"`);
                this.isPlaying = false;
                this.isPaused = false;
                this.currentSong.startTime = Date.now();
                this.currentSong.pausedAt = null;
                this.emitStateChanged();
                this.emit(PLAYBACK_ENDED, { success });
                
                // Restart playback after transition delay
                this.processNextTimeout = setTimeout(() => {
                    this.processNextTimeout = null;
                    this.isHandlingPlaybackFinished = false;
                    this.emit(PLAYBACK_REQUESTED, { filePath, startOffset: 0 });
                }, config.playback.songTransitionDelay);
                return;
            }
        }
        
        // For repeat all mode, track the finished song before clearing
        if (repeatMode === 'all' && this.currentSong && success) {
            // Create a copy of the song data for repeat all
            const songCopy = {
                content: this.currentSong.sourceUrl || this.currentSong.content,
                sourceUrl: this.currentSong.sourceUrl || this.currentSong.content,
                type: this.currentSong.sourceUrl ? 'url' : (this.currentSong.type || 'file'),
                title: this.currentSong.title,
                artist: this.currentSong.artist,
                channel: this.currentSong.channel,
                requester: this.currentSong.requester,
                sender: this.currentSong.sender,
                remoteJid: this.currentSong.remoteJid,
                isPriority: this.currentSong.isPriority,
                thumbnail: this.currentSong.thumbnail,
                thumbnailUrl: this.currentSong.thumbnailUrl,
                duration: this.currentSong.duration,
                songId: this.currentSong.songId
            };
            this.playedQueue.push(songCopy);
        }
        
        this.isPlaying = false;
        this.isPaused = false;
        
        // Cleanup after playback if configured (but not for repeat one, which returns early)
        if (this.currentSong && config.playback.cleanupAfterPlay && repeatMode !== 'one') {
            if (this.currentSong.content && fs.existsSync(this.currentSong.content)) {
                fs.unlinkSync(this.currentSong.content);
            }
            if (this.currentSong.thumbnail && fs.existsSync(this.currentSong.thumbnail)) {
                fs.unlinkSync(this.currentSong.thumbnail);
            }
        }
        
        this.currentSong = null;
        if (success) {
            this.songsPlayed++;
        }
        this.emitStateChanged();
        
        // Emit playback ended event
        this.emit(PLAYBACK_ENDED, { success });
        
        // Check if we need to handle repeat all mode when queue is empty
        const queue = queueManager.getQueue();
        if (queue.length === 0 && repeatMode === 'all' && this.playedQueue.length > 0) {
            logger.info(`Repeat all: re-adding ${this.playedQueue.length} played songs to queue`);
            
            // Check if shuffle is enabled
            const shuffleEnabled = config.playback.shuffleEnabled;
            let songsToAdd = [...this.playedQueue];
            
            // Shuffle if enabled
            if (shuffleEnabled) {
                // Shuffle using weighted selection (VIP songs have 3x weight)
                const shuffled = [];
                const remaining = [...songsToAdd];
                
                while (remaining.length > 0) {
                    const weights = remaining.map(item => item.isPriority ? 3 : 1);
                    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
                    let random = Math.random() * totalWeight;
                    
                    for (let i = 0; i < remaining.length; i++) {
                        random -= weights[i];
                        if (random <= 0) {
                            shuffled.push(remaining.splice(i, 1)[0]);
                            break;
                        }
                    }
                }
                songsToAdd = shuffled;
            }
            
            // Re-add all songs to queue
            songsToAdd.forEach(song => {
                queueManager.add(song);
            });
            
            // Clear playedQueue for next cycle
            this.playedQueue = [];
        }
        
        // Process next item if available
        const updatedQueue = queueManager.getQueue();
        if (updatedQueue.length > 0) {
            this.processNextTimeout = setTimeout(() => {
                this.processNextTimeout = null;
                this.isHandlingPlaybackFinished = false;
                this.processNext();
            }, config.playback.songTransitionDelay);
        } else {
            // No more songs, reset flag immediately
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
            this.emitStateChanged();
            this.emit(PLAYBACK_PAUSE);
            return true;
        }
        return false;
    }
    
    /**
     * Resume playback
     */
    resume() {
        if (!this.currentSong) {
            return false;
        }
        
        // If player is not running, start playback from the saved position
        if (!this.isPlaying) {
            const filePath = this.currentSong.content;
            if (!filePath || !fs.existsSync(filePath)) {
                return false;
            }
            
            // Calculate start offset from paused position
            let startOffset = 0;
            if (this.currentSong.pausedAt && this.currentSong.startTime) {
                startOffset = this.currentSong.pausedAt - this.currentSong.startTime;
            } else if (this.currentSong.startTime) {
                // Calculate elapsed time from startTime
                startOffset = Date.now() - this.currentSong.startTime;
            }
            
            // Start playback from the saved position
            this.isPlaying = true;
            this.isPaused = false;
            this.currentSong.startTime = Date.now() - startOffset;
            this.currentSong.pausedAt = null;
            this.currentSong.isPaused = false;
            this.emitStateChanged();
            this.emit(PLAYBACK_REQUESTED, { filePath, startOffset });
            return true;
        }
        
        // Player is running, just resume
        if (this.isPaused) {
            this.isPaused = false;
            if (this.currentSong.pausedAt && this.currentSong.startTime) {
                const pauseDuration = Date.now() - this.currentSong.pausedAt;
                this.currentSong.startTime += pauseDuration;
                this.currentSong.pausedAt = null;
            }
            this.currentSong.isPaused = false;
            this.emitStateChanged();
            this.emit(PLAYBACK_RESUME);
            return true;
        }
        
        return false;
    }
    
    /**
     * Seek to position
     */
    seek(timeMs) {
        if (this.isPlaying && this.currentSong && this.currentSong.duration) {
            const seekTime = Math.max(0, Math.min(timeMs, this.currentSong.duration));
            this.isSeeking = true;
            
            // Update startTime to reflect the new position
            if (this.isPaused && this.currentSong.pausedAt) {
                const pauseDuration = Date.now() - this.currentSong.pausedAt;
                this.currentSong.startTime = Date.now() - seekTime - pauseDuration;
            } else {
                this.currentSong.startTime = Date.now() - seekTime;
            }
            
            // Clear pausedAt if we were paused (seeking resumes playback)
            if (this.currentSong.pausedAt) {
                this.currentSong.pausedAt = null;
                this.isPaused = false;
            }
            
            this.emitStateChanged();
            this.emit(PLAYBACK_SEEK, { positionMs: seekTime });
            return true;
        }
        return false;
    }
    
    /**
     * Skip current song
     */
    skip() {
        if (this.currentSong) {
            this.emit(PLAYBACK_SKIP);
            return true;
        }
        return false;
    }
    
    /**
     * Reset session
     */
    resetSession() {
        // Stop current playback if playing
        if (this.isPlaying) {
            this.skip();
        }
        
        // Reset all state
        this.currentSong = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.songsPlayed = 0;
        
        // Reset cumulative stats
        statsService.resetStats();
        
        // Clear caches
        try {
            const { clearCaches } = require('../services/download.service');
            const { clearVideoInfoCache } = require('../services/metadata.service');
            const { clearSearchCache } = require('../services/search.service');
            clearCaches();
            clearVideoInfoCache();
            clearSearchCache();
        } catch (e) {
            // Ignore errors if modules aren't loaded yet
        }
        
        this.emitStateChanged();
        return true;
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
            const fileExists = fs.existsSync(this.currentSong.content);
            if (!fileExists) {
                // File no longer exists - clear currentSong and reset playback state
                this.currentSong = null;
                this.isPlaying = false;
                this.isPaused = false;
                // Clear playback state in database
                try {
                    dbService.updatePlaybackState({
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
     * Prefetch next songs in queue
     */
    async prefetchNext(count = null) {
        if (!config.performance.prefetchNext) return;
        
        // Prevent concurrent prefetching calls
        if (this.isPrefetching) {
            logger.debug('Prefetch already in progress, skipping');
            return;
        }
        
        if (count === null) count = config.performance.prefetchCount;
        
        const queue = queueManager.getQueue();
        if (queue.length === 0) return;
        
        // Filter to only songs that need prefetching
        const itemsNeedingPrefetch = queue.filter(item => {
            if (item.type !== 'url') return false;
            if (item.prefetched) return false;
            if (item.downloading) return false;
            if (this.downloadingUrls.has(item.content)) {
                logger.debug(`Skipping duplicate download for: ${item.title || item.content}`);
                return false;
            }
            return true;
        });
        
        if (itemsNeedingPrefetch.length === 0) {
            logger.debug('No songs need prefetching');
            return;
        }
        
        const itemsToPrefetch = count === 0 ? itemsNeedingPrefetch.length : Math.min(count, itemsNeedingPrefetch.length);
        
        logger.info(`Prefetching ${itemsToPrefetch} song(s) from ${itemsNeedingPrefetch.length} that need prefetching (total queue: ${queue.length})`);
        
        this.isPrefetching = true;
        
        let prefetchedCount = 0;
        let failedCount = 0;
        
        // Process items sequentially with delays
        for (let i = 0; i < itemsToPrefetch; i++) {
            // Wait if we have too many concurrent prefetches
            while (this.activePrefetchCount >= this.MAX_CONCURRENT_PREFETCHES) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Rate limiting
            const timeSinceLastPrefetch = Date.now() - this.lastPrefetchTime;
            if (timeSinceLastPrefetch < this.prefetchRateLimitDelay && i > 0) {
                const waitTime = this.prefetchRateLimitDelay - timeSinceLastPrefetch;
                logger.debug(`Rate limiting: waiting ${waitTime}ms before next prefetch`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            
            const item = itemsNeedingPrefetch[i];
            const originalUrl = item.content;
            
            // Skip if URL is already being downloaded
            if (this.downloadingUrls.has(originalUrl)) {
                logger.debug(`Skipping duplicate download (race): ${item.title || originalUrl}`);
                continue;
            }
            
            // Mark URL as being downloaded
            this.downloadingUrls.add(originalUrl);
            this.activePrefetchCount++;
            this.lastPrefetchTime = Date.now();
            
            // Start prefetching (don't await - let it run in background)
            (async () => {
                logger.info(`Prefetching song #${i + 1}/${itemsToPrefetch}: ${item.title || item.content}`);
                item.downloadStatus = 'preparing';
                item.downloadProgress = 0;
                item.downloading = true;
                queueManager.saveQueue(true);
                
                try {
                    const result = await downloadTrack(originalUrl, (progress) => {
                        item.downloadProgress = progress.percent || 0;
                        item.downloadStatus = progress.status || 'downloading';
                        queueManager.saveQueue(true);
                    });
                    
                    item.type = 'file';
                    item.content = result.filePath;
                    item.title = result.title;
                    item.thumbnail = result.thumbnailPath;
                    item.prefetched = true;
                    item.downloading = false;
                    item.downloadStatus = 'ready';
                    item.downloadProgress = 100;
                    logger.info(`✓ Prefetch complete for: ${item.title}`);
                    queueManager.saveQueue(true);
                    prefetchedCount++;
                    
                    // On success, slightly reduce delay
                    this.prefetchRateLimitDelay = Math.max(1000, this.prefetchRateLimitDelay - 100);
                } catch (err) {
                    const errorMsg = err?.message || String(err) || 'Unknown error';
                    logger.error(`✗ Prefetch failed for ${item.title || originalUrl}:`, errorMsg);
                    item.downloading = false;
                    item.downloadStatus = 'error';
                    item.downloadProgress = 0;
                    queueManager.saveQueue(true);
                    failedCount++;
                    
                    // On rate limit error, increase delay significantly
                    if (isRateLimitError(err)) {
                        this.prefetchRateLimitDelay = Math.min(10000, this.prefetchRateLimitDelay * 2);
                        logger.warn(`Rate limited during prefetch. Increasing delay to ${this.prefetchRateLimitDelay}ms`);
                    } else {
                        this.prefetchRateLimitDelay = Math.min(5000, this.prefetchRateLimitDelay + 500);
                    }
                } finally {
                    this.downloadingUrls.delete(originalUrl);
                    this.activePrefetchCount--;
                }
            })();
            
            // Small delay between starting prefetches
            if (i < itemsToPrefetch - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Wait a bit for prefetches to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        logger.info(`Prefetch batch started: ${prefetchedCount} completed, ${failedCount} failed, ${this.activePrefetchCount} still active`);
        
        this.isPrefetching = false;
    }
    
    /**
     * Prefetch all songs in queue
     */
    async prefetchAll() {
        logger.info('Starting prefetch for all queued songs...');
        await this.prefetchNext(0);
    }
}

module.exports = new PlaybackController();


