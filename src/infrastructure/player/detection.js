const { isFFplayAvailable, isCommandInPath } = require('../../utils/dependencies.util');
const { logger } = require('../../utils/logger.util');

/**
 * Backend Detection Module
 * 
 * Detects and selects the best available audio backend.
 */

/**
 * Check if a command is available in PATH
 * @param {string} command - Command name to check
 * @returns {boolean}
 */
function isCommandAvailable(command) {
    return isCommandInPath(command);
}

/**
 * Detect and select the best available audio backend
 * @returns {string|null} 'mpv', 'ffplay', or null if neither is available
 */
function detectBackend() {
    if (isCommandAvailable('mpv')) {
        logger.info('🎵 Audio backend: MPV (seamless effect changes)');
        return 'mpv';
    } else if (isFFplayAvailable()) {
        logger.info('🎵 Audio backend: ffplay (effect changes may cause brief interruption)');
        logger.info('   For seamless effects, install MPV: brew install mpv (or see docs/adr/001-audio-player-backend.md)');
        return 'ffplay';
    } else {
        logger.warn('⚠️  No audio backend available. Please install mpv or ffmpeg.');
        return null;
    }
}

module.exports = {
    detectBackend,
    isCommandAvailable
};

