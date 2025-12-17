const dbService = require('../database/db.service');
const { logger } = require('../utils/logger.util');

/**
 * PlaybackStatePersistence
 * 
 * Handles persistence of playback state to database.
 * Listens to state change events from PlaybackController and persists them.
 * Uses debouncing to batch multiple rapid state changes.
 */
class PlaybackStatePersistence {
    constructor(playbackController) {
        this.controller = playbackController;
        this.debounceTimer = null;
        this.debounceDelay = 500; // Batch writes within 500ms
        this.setupListeners();
    }
    
    /**
     * Set up event listeners for state changes
     */
    setupListeners() {
        // Listen for state changes and persist (with debouncing)
        this.controller.on('state_changed', () => {
            this.debouncedSave();
        });
    }
    
    /**
     * Debounce state saves to batch rapid changes
     */
    debouncedSave() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.saveState();
        }, this.debounceDelay);
    }
    
    /**
     * Save playback state to database
     */
    saveState() {
        try {
            dbService.updatePlaybackState({
                is_playing: this.controller.isPlaying ? 1 : 0,
                is_paused: this.controller.isPaused ? 1 : 0,
                current_song_id: this.controller.currentSong ? dbService.getOrCreateSong({
                    content: this.controller.currentSong.content,
                    title: this.controller.currentSong.title,
                    artist: this.controller.currentSong.artist,
                    channel: this.controller.currentSong.channel,
                    duration: this.controller.currentSong.duration,
                    thumbnail_path: this.controller.currentSong.thumbnail,
                    thumbnail_url: this.controller.currentSong.thumbnailUrl
                }) : null,
                start_time: this.controller.currentSong?.startTime ? Math.floor(this.controller.currentSong.startTime / 1000) : null,
                paused_at: this.controller.currentSong?.pausedAt ? Math.floor(this.controller.currentSong.pausedAt / 1000) : null,
                seek_position: this.controller.currentSong?.elapsed || null,
                songs_played: this.controller.songsPlayed
            });
        } catch (e) {
            logger.error('Failed to save playback state:', e);
        }
    }
    
    /**
     * Force immediate save (useful for shutdown or critical state changes)
     */
    saveStateImmediate() {
        clearTimeout(this.debounceTimer);
        this.saveState();
    }
}

module.exports = PlaybackStatePersistence;

