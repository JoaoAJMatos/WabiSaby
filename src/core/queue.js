const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { checkPriority } = require('../services/priority.service');
const statsService = require('../services/stats.service');

class QueueManager extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.isPlaying = false;
        this.isPaused = false;
        this.isSeeking = false;
        this.currentSong = null;
        this.queueFile = config.files.queue;
        this.songsPlayed = 0;
        this.loadQueue();
    }

    loadQueue() {
        try {
            if (fs.existsSync(this.queueFile)) {
                const data = fs.readFileSync(this.queueFile, 'utf8');
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                    this.queue = parsed;
                } else {
                    this.queue = parsed.queue || [];
                    this.songsPlayed = parsed.songsPlayed || 0;
                    if (parsed.currentSong) {
                        // Put the interrupted song back at the start of the queue
                        this.queue.unshift(parsed.currentSong);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load queue:', e);
        }
    }

    saveQueue(emitUpdate = false) {
        try {
            const data = {
                queue: this.queue,
                currentSong: this.currentSong,
                songsPlayed: this.songsPlayed
            };
            fs.writeFileSync(this.queueFile, JSON.stringify(data, null, 2));
            
            // Emit update event if requested (for real-time UI updates during downloads)
            if (emitUpdate) {
                this.emit('queue_updated');
            }
        } catch (e) {
            console.error('Failed to save queue:', e);
        }
    }

    checkPriority(sender) {
        return checkPriority(sender);
    }

    add(song) {
        const isPriority = this.checkPriority(song.sender);
        song.isPriority = isPriority;

        if (isPriority && this.queue.length > 0) {
            // Find the first non-priority item to insert before it
            let insertIndex = this.queue.length;
            for (let i = 0; i < this.queue.length; i++) {
                if (!this.queue[i].isPriority) {
                    insertIndex = i;
                    break;
                }
            }
            this.queue.splice(insertIndex, 0, song);
        } else {
            this.queue.push(song);
        }

        this.saveQueue();
        this.emit('queue_updated');
        this.processQueue();
    }

    remove(index) {
        if (index >= 0 && index < this.queue.length) {
            const removed = this.queue.splice(index, 1);
            this.saveQueue();
            this.emit('queue_updated');
            return removed[0];
        }
        return null;
    }

    reorder(fromIndex, toIndex) {
        if (fromIndex >= 0 && fromIndex < this.queue.length && 
            toIndex >= 0 && toIndex < this.queue.length) {
            const [item] = this.queue.splice(fromIndex, 1);
            this.queue.splice(toIndex, 0, item);
            this.saveQueue();
            this.emit('queue_updated');
            return true;
        }
        return false;
    }

    getQueue() {
        return this.queue;
    }

    getCurrent() {
        return this.currentSong;
    }

    clear() {
        this.queue = [];
        this.saveQueue();
        this.emit('queue_updated');
        
        // Clear caches when queue is cleared
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
    }

    resetSession() {
        // Stop current playback if playing
        if (this.isPlaying) {
            this.emit('skip_current');
        }

        // Reset all state
        this.queue = [];
        this.currentSong = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.songsPlayed = 0; // Reset session counter
        
        // Also reset cumulative stats
        statsService.resetStats();
        
        // Clear caches when session is reset
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
        
        this.saveQueue(true); // Save and emit update
        return true;
    }

    processQueue() {
        if (this.isPlaying || this.queue.length === 0) {
            return;
        }

        this.isPlaying = true;
        this.isPaused = false;
        this.currentSong = this.queue.shift();
        this.saveQueue();
        
        // Record song in stats
        if (this.currentSong) {
            statsService.recordSongPlayed(this.currentSong);
        }
        
        this.emit('play_next', this.currentSong);
    }

    songFinished() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentSong = null;
        this.songsPlayed++;
        this.saveQueue();
        this.processQueue();
    }
    
    skip() {
        if(this.currentSong) {
             this.emit('skip_current');
             // The actual skipping logic (stopping playback) will be handled by the player/downloader
             // which will then call songFinished()
        }
    }

    pause() {
        if (this.isPlaying && !this.isPaused && this.currentSong) {
            this.isPaused = true;
            this.currentSong.pausedAt = Date.now();
            this.saveQueue();
            this.emit('pause_current');
            return true;
        }
        return false;
    }

    resume() {
        if (this.isPlaying && this.isPaused && this.currentSong) {
            this.isPaused = false;
            if (this.currentSong.pausedAt && this.currentSong.startTime) {
                const pauseDuration = Date.now() - this.currentSong.pausedAt;
                this.currentSong.startTime += pauseDuration;
                this.currentSong.pausedAt = null;
            }
            this.saveQueue();
            this.emit('resume_current');
            return true;
        }
        return false;
    }

    seek(timeMs) {
        if (this.isPlaying && this.currentSong && this.currentSong.duration) {
            // Clamp the seek time to valid range
            const seekTime = Math.max(0, Math.min(timeMs, this.currentSong.duration));
            
            // Set seeking flag
            this.isSeeking = true;
            
            // Update startTime to reflect the new position
            // If paused, account for the pause time
            if (this.isPaused && this.currentSong.pausedAt) {
                // Calculate how long we've been paused
                const pauseDuration = Date.now() - this.currentSong.pausedAt;
                // Set startTime so that elapsed time equals seekTime
                this.currentSong.startTime = Date.now() - seekTime - pauseDuration;
            } else {
                // Set startTime so that elapsed time equals seekTime
                this.currentSong.startTime = Date.now() - seekTime;
            }
            
            // Clear pausedAt if we were paused (seeking resumes playback)
            if (this.currentSong.pausedAt) {
                this.currentSong.pausedAt = null;
                this.isPaused = false;
            }
            
            this.saveQueue();
            this.emit('seek_current', seekTime);
            return true;
        }
        return false;
    }
}

module.exports = new QueueManager();

