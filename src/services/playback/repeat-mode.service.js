const { logger } = require('../../utils/logger.util');
const { isFilePath } = require('../../utils/url.util');
// Direct requires to avoid circular dependencies
const queueService = require('./queue.service');
const shuffleService = require('./shuffle.service');

/**
 * Repeat Mode Service
 *
 * Handles all repeat mode logic:
 * - Repeat one mode (restart current song)
 * - Repeat all mode (track played songs, re-add to queue)
 */
class RepeatModeService {
    constructor() {
        this.playedQueue = []; // Track played songs for repeat all mode
        this.repeatedSongId = null; // Track which song has been repeated once
    }

    /**
     * Check if should restart current song (repeat one mode)
     * @param {string} repeatMode - Current repeat mode
     * @param {Object} currentSong - Current song object
     * @param {boolean} success - Whether playback was successful
     * @returns {boolean} True if should restart
     */
    shouldRestartSong(repeatMode, currentSong, success) {
        if (repeatMode !== 'one' || !currentSong || !success) {
            return false;
        }
        
        // Only restart if this song hasn't been repeated yet
        const songId = currentSong.id || currentSong.content;
        return this.repeatedSongId !== songId;
    }

    /**
     * Handle repeat one mode - restart current song
     * @param {Object} currentSong - Current song object
     * @param {function} emitPlaybackRequested - Function to emit playback requested event
     * @param {function} emitStateChanged - Function to emit state changed event
     * @param {Object} config - Config object
     * @returns {boolean} True if handled (caller should return early)
     */
    async handleRepeatOne(currentSong, emitPlaybackRequested, emitStateChanged, config) {
        const filePath = currentSong.content;
        if (filePath && require('fs').existsSync(filePath)) {
            // Mark this song as having been repeated
            const songId = currentSong.id || currentSong.content;
            this.repeatedSongId = songId;
            
            // Don't clear currentSong, don't increment songsPlayed, don't cleanup
            // Just restart playback
            logger.info(`Repeat one: restarting current song "${currentSong.title || 'Unknown'}"`);

            // Reset playback state for restart
            currentSong.startTime = Date.now();
            currentSong.pausedAt = null;

            emitStateChanged();

            // Restart playback after transition delay
            setTimeout(() => {
                emitPlaybackRequested({ filePath, startOffset: 0 });
            }, config.playback.songTransitionDelay);

            return true; // Caller should return early
        }
        return false; // Continue with normal flow
    }

    /**
     * Track song for repeat all mode
     * @param {Object} currentSong - Current song object
     * @param {boolean} success - Whether playback was successful
     */
    trackSongForRepeatAll(currentSong, success) {
        if (success && currentSong) {
            // Determine the source URL for repeat all
            // Prefer sourceUrl if available, otherwise use content if it's a URL
            let sourceUrl = currentSong.sourceUrl;
            let content = currentSong.content;
            
            // If no sourceUrl, check if content is a URL (not a file path)
            if (!sourceUrl && content && !isFilePath(content)) {
                sourceUrl = content;
            }
            
            // If content is a file path and we have sourceUrl, use sourceUrl as content
            if (isFilePath(content) && sourceUrl) {
                content = sourceUrl;
            }
            
            // Determine type: if we have a valid URL (not file path), it's 'url', otherwise 'file'
            const finalContent = sourceUrl || content;
            const isUrl = finalContent && !isFilePath(finalContent);
            
            // Create a copy of the song data for repeat all
            const songCopy = {
                content: finalContent,
                sourceUrl: sourceUrl || (isUrl ? finalContent : null),
                type: isUrl ? 'url' : 'file',
                title: currentSong.title,
                artist: currentSong.artist,
                channel: currentSong.channel,
                requester: currentSong.requester,
                sender: currentSong.sender,
                remoteJid: currentSong.remoteJid,
                isPriority: currentSong.isPriority,
                thumbnail: currentSong.thumbnail,
                thumbnailUrl: currentSong.thumbnailUrl,
                duration: currentSong.duration,
                songId: currentSong.songId
            };
            this.playedQueue.push(songCopy);
        }
    }

    /**
     * Handle repeat all mode when queue is empty
     * @param {Object} config - Config object
     */
    async handleRepeatAll(config) {
        if (this.playedQueue.length === 0) {
            return false;
        }

        logger.info(`Repeat all: re-adding ${this.playedQueue.length} played songs to queue`);

        // Check if shuffle is enabled
        const shuffleEnabled = config.playback.shuffleEnabled;
        let songsToAdd = [...this.playedQueue];

        // Shuffle if enabled using shuffle service
        if (shuffleEnabled) {
            songsToAdd = shuffleService.shuffleForRepeatAll(songsToAdd, shuffleEnabled);
        }

        // Re-add all songs to queue
        songsToAdd.forEach(song => {
            queueService.add(song);
        });

        // Clear playedQueue for next cycle
        this.playedQueue = [];

        return true;
    }

    /**
     * Get played queue (for debugging/testing)
     * @returns {Array} Copy of played queue
     */
    getPlayedQueue() {
        return [...this.playedQueue];
    }

    /**
     * Clear played queue
     */
    clearPlayedQueue() {
        this.playedQueue = [];
    }

    /**
     * Clear repeat one tracking (called when a new song starts)
     * @param {Object} currentSong - The new current song
     */
    clearRepeatOneTracking(currentSong) {
        if (currentSong) {
            const songId = currentSong.id || currentSong.content;
            // Only clear if it's a different song
            if (this.repeatedSongId !== songId) {
                this.repeatedSongId = null;
            }
        } else {
            // No current song, clear tracking
            this.repeatedSongId = null;
        }
    }
}

module.exports = new RepeatModeService();
