const services = require('../');

/**
 * Session Service
 *
 * Handles session management operations:
 * - Reset playback state and statistics
 * - Clear all service caches
 */
class SessionService {
    constructor() {}

    /**
     * Reset session - clear playback state, stats, and caches
     * @param {Object} playbackOrchestrator - Playback orchestrator instance
     * @param {Object} statsService - Stats service instance
     * @returns {boolean} Success status
     */
    resetSession(playbackOrchestrator, statsService) {
        // Stop current playback if playing
        if (playbackOrchestrator.isPlaying) {
            playbackOrchestrator.skip();
        }

        // Reset all state
        playbackOrchestrator.currentSong = null;
        playbackOrchestrator.isPlaying = false;
        playbackOrchestrator.isPaused = false;
        playbackOrchestrator.songsPlayed = 0;

        // Reset cumulative stats
        statsService.resetStats();

        // Clear caches
        this.clearCaches();

        // Emit state changed
        playbackOrchestrator.emitStateChanged();

        return true;
    }

    /**
     * Clear all service caches
     */
    clearCaches() {
        try {
            // Clear download service caches
            const { clearCaches } = require('../audio/download.service');
            clearCaches();
        } catch (e) {
            // Ignore errors if modules aren't loaded yet
        }

        try {
            // Clear metadata service caches
            const { clearVideoInfoCache } = require('../metadata/metadata.service');
            clearVideoInfoCache();
        } catch (e) {
            // Ignore errors if modules aren't loaded yet
        }

        try {
            // Clear YouTube search caches
            const { clearSearchCache } = require('../youtube/search.service');
            clearSearchCache();
        } catch (e) {
            // Ignore errors if modules aren't loaded yet
        }
    }
}

module.exports = new SessionService();
