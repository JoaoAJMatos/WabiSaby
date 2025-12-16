const EventEmitter = require('events');
const dbService = require('../database/db.service');
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
        this.songsPlayed = 0;
        this.queueItemIds = new Map(); // Map position -> queue_item_id for database updates
        this.loadQueue();
    }

    loadQueue() {
        try {
            // Load queue items from database
            const dbItems = dbService.getQueueItems();
            this.queue = dbItems.map(item => ({
                id: item.id,
                content: item.content,
                title: item.title,
                artist: item.artist,
                channel: item.channel,
                requester: item.requester_name,
                sender: item.sender_id || item.requester_whatsapp_id,
                remoteJid: item.group_id,
                isPriority: item.is_priority === 1,
                downloadStatus: item.download_status,
                downloadProgress: item.download_progress,
                downloading: item.download_status === 'downloading',
                thumbnail: item.thumbnail_path,
                thumbnailUrl: item.thumbnail_url,
                prefetched: item.prefetched === 1,
                duration: item.duration
            }));
            
            // Store mapping of position to queue item ID
            this.queueItemIds.clear();
            this.queue.forEach((item, index) => {
                if (item.id) {
                    this.queueItemIds.set(index, item.id);
                }
            });
            
            // Load playback state
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
            console.error('Failed to load queue:', e);
        }
    }

    saveQueue(emitUpdate = false) {
        try {
            // Update playback state in database
            dbService.updatePlaybackState({
                is_playing: this.isPlaying ? 1 : 0,
                is_paused: this.isPaused ? 1 : 0,
                current_song_id: this.currentSong ? dbService.getOrCreateSong({
                    content: this.currentSong.content,
                    title: this.currentSong.title,
                    artist: this.currentSong.artist,
                    channel: this.currentSong.channel,
                    duration: this.currentSong.duration,
                    thumbnail_path: this.currentSong.thumbnail,
                    thumbnail_url: this.currentSong.thumbnailUrl
                }) : null,
                start_time: this.currentSong?.startTime ? Math.floor(this.currentSong.startTime / 1000) : null,
                paused_at: this.currentSong?.pausedAt ? Math.floor(this.currentSong.pausedAt / 1000) : null,
                seek_position: this.currentSong?.elapsed || null,
                songs_played: this.songsPlayed
            });
            
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

        let insertIndex = this.queue.length;
        if (isPriority && this.queue.length > 0) {
            // Find the first non-priority item to insert before it
            for (let i = 0; i < this.queue.length; i++) {
                if (!this.queue[i].isPriority) {
                    insertIndex = i;
                    break;
                }
            }
        }

        // Add to database
        const queueItemId = dbService.addQueueItem({
            content: song.content,
            title: song.title || 'Unknown',
            artist: song.artist || null,
            channel: song.channel || null,
            duration: song.duration || null,
            thumbnail_path: song.thumbnail || null,
            thumbnail_url: song.thumbnailUrl || null,
            requester: song.requester || song.sender || 'Unknown',
            sender_id: song.sender || song.remoteJid || null,
            group_id: song.remoteJid || null,
            is_priority: isPriority,
            download_status: song.downloadStatus || 'pending',
            download_progress: song.downloadProgress || 0,
            prefetched: song.prefetched || false,
            position: insertIndex
        });

        // Add to in-memory queue
        const queueItem = {
            id: queueItemId,
            ...song,
            isPriority
        };
        this.queue.splice(insertIndex, 0, queueItem);
        this.queueItemIds.set(insertIndex, queueItemId);

        // Update positions for items after insertion
        for (let i = insertIndex + 1; i < this.queue.length; i++) {
            const itemId = this.queueItemIds.get(i);
            if (itemId) {
                this.queueItemIds.set(i, itemId);
            }
        }

        this.saveQueue();
        this.emit('queue_updated');
        this.processQueue();
    }

    remove(index) {
        if (index >= 0 && index < this.queue.length) {
            const itemId = this.queueItemIds.get(index);
            if (itemId) {
                dbService.removeQueueItem(itemId);
            }
            
            const removed = this.queue.splice(index, 1);
            this.queueItemIds.delete(index);
            
            // Update positions for remaining items
            this.queueItemIds.clear();
            this.queue.forEach((item, i) => {
                if (item.id) {
                    this.queueItemIds.set(i, item.id);
                }
            });
            
            this.saveQueue();
            this.emit('queue_updated');
            return removed[0];
        }
        return null;
    }

    reorder(fromIndex, toIndex) {
        if (fromIndex >= 0 && fromIndex < this.queue.length && 
            toIndex >= 0 && toIndex < this.queue.length) {
            // Reorder in database
            dbService.reorderQueue(fromIndex, toIndex);
            
            // Reorder in memory
            const [item] = this.queue.splice(fromIndex, 1);
            this.queue.splice(toIndex, 0, item);
            
            // Update position mappings
            this.queueItemIds.clear();
            this.queue.forEach((item, i) => {
                if (item.id) {
                    this.queueItemIds.set(i, item.id);
                }
            });
            
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
        dbService.clearQueue();
        this.queue = [];
        this.queueItemIds.clear();
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
        
        // Remove first item from queue
        const queueItem = this.queue.shift();
        const itemId = this.queueItemIds.get(0);
        this.queueItemIds.delete(0);
        
        // Update position mappings
        this.queueItemIds.clear();
        this.queue.forEach((item, i) => {
            if (item.id) {
                this.queueItemIds.set(i, item.id);
            }
        });
        
        // Remove from database
        if (itemId) {
            dbService.removeQueueItem(itemId);
        }
        
        // Set as current song
        this.currentSong = queueItem;
        if (this.currentSong) {
            this.currentSong.startTime = Date.now();
            this.currentSong.pausedAt = null;
        }
        
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

