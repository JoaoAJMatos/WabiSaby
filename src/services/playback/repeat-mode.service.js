const { logger } = require('../../utils/logger.util');
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
    }

    /**
     * Check if should restart current song (repeat one mode)
     * @param {string} repeatMode - Current repeat mode
     * @param {Object} currentSong - Current song object
     * @param {boolean} success - Whether playback was successful
     * @returns {boolean} True if should restart
     */
    shouldRestartSong(repeatMode, currentSong, success) {
        return repeatMode === 'one' && currentSong && success;
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
            // Create a copy of the song data for repeat all
            const songCopy = {
                content: currentSong.sourceUrl || currentSong.content,
                sourceUrl: currentSong.sourceUrl || currentSong.content,
                type: currentSong.sourceUrl ? 'url' : (currentSong.type || 'file'),
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
}

module.exports = new RepeatModeService();
