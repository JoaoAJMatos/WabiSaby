const { logger } = require('../../utils/logger.util');
const effectsService = require('../../services/audio/effects.service');
const { detectBackend } = require('./detection');
const MpvPlayer = require('./mpv');
const FfplayPlayer = require('./ffplay');
const { eventBus } = require('../../events');
const {
    PLAYBACK_REQUESTED,
    PLAYBACK_STARTED,
    PLAYBACK_FINISHED,
    PLAYBACK_ERROR,
    PLAYBACK_PAUSE,
    PLAYBACK_RESUME,
    PLAYBACK_SEEK,
    PLAYBACK_SKIP,
    EFFECTS_CHANGED
} = require('../../events');

/**
 * Player Module
 * 
 * Pure Audio Backend - manages MPV/ffplay processes and provides playback control API.
 * Listens to events from PlaybackController and emits playback events.
 * 
 * See docs/adr/001-audio-player-backend.md for architecture details
 */

// Backend instance
let playerInstance = null;
let detectedBackend = null;

/**
 * Get or create the player instance
 */
function getPlayerInstance() {
    if (!playerInstance) {
        const backend = detectBackend();
        if (!backend) {
            return null;
        }

        detectedBackend = backend;
        if (backend === 'mpv') {
            playerInstance = new MpvPlayer();
        } else if (backend === 'ffplay') {
            playerInstance = new FfplayPlayer();
        }
    }
    return playerInstance;
}

/**
 * Play file (event-driven entry point)
 */
async function playFile(filePath, startOffset = 0) {
    const player = getPlayerInstance();

    if (!player) {
        const error = new Error('No audio backend available. Please install mpv or ffmpeg.');
        logger.error('Playback error:', error);
        eventBus.emit(PLAYBACK_ERROR, { filePath, error });
        throw error;
    }

    try {
        await player.play(filePath, startOffset);
    } catch (error) {
        logger.error('Playback error:', error);
        eventBus.emit(PLAYBACK_ERROR, { filePath, error });
        throw error;
    }
}

/**
 * Update filters - seamless for MPV, requires restart for ffplay
 */
async function updateFilters() {
    const player = getPlayerInstance();
    if (player) {
        await player.updateFilters();
    }
}

/**
 * Pause playback
 */
async function pausePlayback() {
    const player = getPlayerInstance();
    if (player) {
        await player.pause();
    }
}

/**
 * Resume playback
 */
async function resumePlayback() {
    const player = getPlayerInstance();
    if (player) {
        await player.resume();
    }
}

/**
 * Seek to position
 */
async function seekTo(positionMs) {
    const player = getPlayerInstance();
    if (player) {
        await player.seek(positionMs);
    }
}

/**
 * Get current playback position
 */
async function getPosition() {
    const player = getPlayerInstance();
    if (player) {
        return await player.getPosition();
    }
    return 0;
}

/**
 * Set volume (0-100)
 */
async function setVolume(volume) {
    const player = getPlayerInstance();
    if (player) {
        await player.setVolume(volume);
    }
}

/**
 * Get current volume
 */
function getVolume() {
    const player = getPlayerInstance();
    if (player) {
        return player.getVolume();
    }
    return 100;
}

/**
 * Stop MPV (for backward compatibility)
 */
async function stopMpv() {
    const player = getPlayerInstance();
    if (player && player instanceof MpvPlayer) {
        await player.stop();
    }
}

/**
 * Stop ffplay (for backward compatibility)
 */
async function stopFfplay() {
    const player = getPlayerInstance();
    if (player && player instanceof FfplayPlayer) {
        await player.stop();
    }
}

/**
 * Get effects
 */
function getEffects() {
    return effectsService.getEffects();
}

/**
 * Get presets
 */
function getPresets() {
    return effectsService.getPresetsInfo();
}

/**
 * Get backend name
 */
function getBackend() {
    return detectedBackend || detectBackend();
}

// Event listeners are now registered in the centralized listener registry
// See src/events/listeners/index.js

// ============================================
// EXPORTS
// ============================================

module.exports = {
    playFile,
    getEffects,
    getPresets,
    getBackend,
    updateFilters,
    pausePlayback,
    resumePlayback,
    seekTo,
    getPosition,
    stopMpv,
    stopFfplay,
    setVolume,
    getVolume,
    getPlayerInstance
};
