/**
 * Playback Configuration
 * Manages playback-related settings
 */

class PlaybackConfig {
    constructor() {
        // Default playback configuration
        this.defaults = {
            cleanupAfterPlay: true,
            cleanupOnStartup: false,
            songTransitionDelay: 100,
            confirmSkip: true,
            showRequesterName: true,
            shuffleEnabled: false,
            repeatMode: 'off',
        };
    }

    /**
     * Get playback configuration
     * @returns {Object} Playback configuration
     */
    getConfig() {
        return { ...this.defaults };
    }
}

module.exports = new PlaybackConfig();
