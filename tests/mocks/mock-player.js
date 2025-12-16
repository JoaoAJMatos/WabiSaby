/**
 * Mock Audio Player
 * Simulates audio playback without actual audio processing
 */

const EventEmitter = require('events');

class MockPlayer extends EventEmitter {
    constructor() {
        super();
        this.isPlaying = false;
        this.isPaused = false;
        this.currentFile = null;
        this.position = 0;
        this.startTime = null;
        this.pausedAt = null;
        this.backend = 'mock';
        this.playbackHistory = [];
    }

    async play(filePath, startTimeOffset = 0) {
        this.currentFile = filePath;
        this.isPlaying = true;
        this.isPaused = false;
        this.startTime = Date.now() - startTimeOffset;
        this.pausedAt = null;
        this.position = startTimeOffset;

        this.playbackHistory.push({
            file: filePath,
            startTime: this.startTime,
            startOffset: startTimeOffset
        });

        // Simulate playback completion after a short delay
        setTimeout(() => {
            if (this.isPlaying && !this.isPaused) {
                this.emit('playback_ended');
            }
        }, 100);

        return Promise.resolve();
    }

    async pause() {
        if (this.isPlaying && !this.isPaused) {
            this.isPaused = true;
            this.pausedAt = Date.now();
            this.emit('paused');
        }
    }

    async resume() {
        if (this.isPlaying && this.isPaused) {
            const pauseDuration = Date.now() - this.pausedAt;
            this.startTime += pauseDuration;
            this.isPaused = false;
            this.pausedAt = null;
            this.emit('resumed');
        }
    }

    async seek(positionMs) {
        if (this.isPlaying) {
            this.position = positionMs;
            if (this.startTime) {
                this.startTime = Date.now() - positionMs;
            }
            this.emit('seeked', positionMs);
        }
    }

    async stop() {
        const wasPlaying = this.isPlaying;
        this.isPlaying = false;
        this.isPaused = false;
        this.currentFile = null;
        this.position = 0;
        this.startTime = null;
        this.pausedAt = null;

        if (wasPlaying) {
            this.emit('stopped');
        }
    }

    getPosition() {
        if (!this.isPlaying || !this.startTime) {
            return 0;
        }
        if (this.isPaused && this.pausedAt) {
            return this.pausedAt - this.startTime;
        }
        return Date.now() - this.startTime;
    }

    getCurrentFile() {
        return this.currentFile;
    }

    getBackend() {
        return this.backend;
    }

    // Test utilities
    _simulatePlaybackEnd() {
        if (this.isPlaying) {
            this.isPlaying = false;
            this.emit('playback_ended');
        }
    }

    _setPosition(positionMs) {
        this.position = positionMs;
    }

    _clearHistory() {
        this.playbackHistory = [];
    }
}

module.exports = MockPlayer;

