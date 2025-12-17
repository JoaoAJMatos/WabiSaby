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
                        this.currentSong = {
                            content: song.content,
                            title: song.title,
                            artist: song.artist,
                            channel: song.channel,
                            duration: song.duration,
                            thumbnail: song.thumbnail_path,
                            thumbnailUrl: song.thumbnail_url,
                            startTime: playbackState.start_time ? playbackState.start_time * 1000 : Date.now(),
                            pausedAt: playbackState.paused_at ? playbackState.paused_at * 1000 : null,
                            isPaused: this.isPaused
                        };
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
     * Process next item in queue
     */
    async processNext() {
        const queue = queueManager.getQueue();
        if (this.isPlaying || queue.length === 0) {
            return;
        }
        
        this.isPlaying = true;
        this.isPaused = false;
        
        // Get first item from queue (don't remove yet - playItem will remove it after download)
        const queueItem = queue[0];
        
        if (!queueItem) {
            this.isPlaying = false;
            return;
        }
        
        // Play the item (it will be removed from queue after successful download)
        await this.playItem(queueItem);
    }
    
    /**
     * Play a queue item (download if needed, then emit playback_requested)
     */
    async playItem(item) {
        try {
            let filePath;
            let title = 'Audio';
            
            // Prefetch ALL songs in background
            this.prefetchNext(0).catch(err => logger.error('Prefetch error', err));
            
            if (item.type === 'url') {
                item.downloadStatus = 'preparing';
                item.downloadProgress = 0;
                queueManager.saveQueue(true);
                
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
                
                item.type = 'file';
                item.content = filePath;
                item.thumbnail = result.thumbnailPath;
                item.downloadStatus = 'ready';
                item.downloadProgress = 100;
                queueManager.saveQueue(true);
            } else if (item.type === 'file') {
                filePath = item.content;
                title = item.title || 'User Attachment';
            }
            
            if (filePath && fs.existsSync(filePath)) {
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
                        await sendMessageWithMention(this.whatsappSocket, item.remoteJid, `▶️ ${title}`, item.sender);
                    } catch (e) {
                        logger.warn('Failed to send playing notification:', e.message);
                    }
                }
                
                logger.info(`Playing locally: ${filePath}`);
                
                // Remove item from queue (it's now playing)
                const queue = queueManager.getQueue();
                const index = queue.findIndex(q => q.id === item.id);
                if (index !== -1) {
                    queueManager.remove(index);
                }
                
                // Emit playback_requested event to Player
                this.emit(PLAYBACK_REQUESTED, { filePath, startOffset: 0 });
            } else {
                logger.error('File not found or download failed');
                if (this.isConnected && item.remoteJid && item.remoteJid !== 'WEB_DASHBOARD') {
                    try {
                        await sendMessageWithMention(this.whatsappSocket, item.remoteJid, 'Failed to play song.', item.sender);
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
                    await sendMessageWithMention(this.whatsappSocket, item.remoteJid, `Error: ${error.message}`, item.sender);
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
        this.isPlaying = false;
        this.isPaused = false;
        
        // Cleanup after playback if configured
        if (this.currentSong && config.playback.cleanupAfterPlay) {
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
        
        // Process next item if available
        if (queueManager.getQueue().length > 0) {
            setTimeout(() => this.processNext(), config.playback.songTransitionDelay);
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
        if (this.isPlaying && this.isPaused && this.currentSong) {
            this.isPaused = false;
            if (this.currentSong.pausedAt && this.currentSong.startTime) {
                const pauseDuration = Date.now() - this.currentSong.pausedAt;
                this.currentSong.startTime += pauseDuration;
                this.currentSong.pausedAt = null;
            }
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

