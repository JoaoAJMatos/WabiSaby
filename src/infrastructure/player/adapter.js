/**
 * Player Adapter Interface
 * 
 * Base class that defines the common API for all audio player backends.
 * Each backend (MPV, ffplay, etc.) must implement these methods.
 */
class PlayerAdapter {
    /**
     * Start playback of a file
     * @param {string} filePath - Path to the audio file
     * @param {number} startOffset - Start position in milliseconds
     * @returns {Promise<void>}
     */
    async play(filePath, startOffset = 0) {
        throw new Error('play() must be implemented by subclass');
    }

    /**
     * Stop playback
     * @returns {Promise<void>}
     */
    async stop() {
        throw new Error('stop() must be implemented by subclass');
    }

    /**
     * Pause playback
     * @returns {Promise<void>}
     */
    async pause() {
        throw new Error('pause() must be implemented by subclass');
    }

    /**
     * Resume playback
     * @returns {Promise<void>}
     */
    async resume() {
        throw new Error('resume() must be implemented by subclass');
    }

    /**
     * Seek to a specific position
     * @param {number} positionMs - Position in milliseconds
     * @returns {Promise<void>}
     */
    async seek(positionMs) {
        throw new Error('seek() must be implemented by subclass');
    }

    /**
     * Get current playback position
     * @returns {Promise<number>} Position in milliseconds
     */
    async getPosition() {
        throw new Error('getPosition() must be implemented by subclass');
    }

    /**
     * Set volume
     * @param {number} volume - Volume (0-100)
     * @returns {Promise<void>}
     */
    async setVolume(volume) {
        throw new Error('setVolume() must be implemented by subclass');
    }

    /**
     * Get current volume
     * @returns {number} Volume (0-100)
     */
    getVolume() {
        throw new Error('getVolume() must be implemented by subclass');
    }

    /**
     * Update audio filters/effects
     * @returns {Promise<void>}
     */
    async updateFilters() {
        throw new Error('updateFilters() must be implemented by subclass');
    }

    /**
     * Check if playback is currently active
     * @returns {boolean}
     */
    isPlaying() {
        throw new Error('isPlaying() must be implemented by subclass');
    }

    /**
     * Get the name of this backend
     * @returns {string}
     */
    getName() {
        throw new Error('getName() must be implemented by subclass');
    }
}

module.exports = PlayerAdapter;

