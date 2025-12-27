const dbService = require('../../infrastructure/database/db.service');
const { logger } = require('../../utils/logger.util');
const fs = require('fs');

/**
 * Playback State Service
 * 
 * Handles all playback state persistence (loading and saving).
 * Separates persistence concerns from playback orchestration.
 */
class PlaybackStateService {
    constructor() {
        this.state = {
            isPlaying: false,
            isPaused: false,
            currentSong: null,
            songsPlayed: 0
        };
        this.loaded = false;
        this.debounceTimer = null;
        this.debounceDelay = 500; // Batch writes within 500ms
    }

    /**
     * Load state from database
     * @returns {Object} Current state
     */
    load() {
        // Check if database is initialized
        try {
            const { getDatabase } = require('../../infrastructure/database');
            getDatabase(); // Will throw if not initialized
        } catch (e) {
            // Database not initialized yet - skip loading, will use defaults
            return this.state;
        }

        try {
            const playbackState = dbService.getPlaybackState();
            if (playbackState) {
                this.state.isPlaying = playbackState.is_playing === 1;
                this.state.isPaused = playbackState.is_paused === 1;
                this.state.songsPlayed = playbackState.songs_played || 0;
                
                // Load current song if exists
                if (playbackState.current_song_id) {
                    const song = dbService.getSong(playbackState.current_song_id);
                    if (song) {
                        // Check if file exists - if not, don't restore currentSong
                        let fileExists = false;
                        if (song.content) {
                            try {
                                fileExists = fs.existsSync(song.content);
                            } catch (e) {
                                logger.warn('Error checking file existence:', e.message);
                                fileExists = false;
                            }
                        }
                        
                        // Only restore currentSong if file exists
                        if (fileExists) {
                            // Determine type: if content is a file path (not a URL), it's a file
                            const isFile = song.content && !song.content.startsWith('http://') && !song.content.startsWith('https://');
                            
                            // Calculate the elapsed time when playback was stopped
                            let elapsedTime = 0;
                            if (playbackState.start_time) {
                                if (playbackState.paused_at) {
                                    // Was paused - use paused_at time
                                    elapsedTime = playbackState.paused_at - playbackState.start_time;
                                } else {
                                    // Was playing - calculate from start_time to now (but we'll set it as paused)
                                    elapsedTime = Math.floor(Date.now() / 1000) - playbackState.start_time;
                                }
                            }
                            
                            // Always restore in paused state (stopped) - user must click play to resume
                            this.state.isPlaying = false;
                            this.state.isPaused = true;
                            
                            this.state.currentSong = {
                                content: song.content,
                                title: song.title,
                                artist: song.artist,
                                channel: song.channel,
                                duration: song.duration,
                                thumbnail: song.thumbnail_path,
                                thumbnailUrl: song.thumbnail_url,
                                type: isFile ? 'file' : 'url',
                                startTime: playbackState.start_time ? playbackState.start_time * 1000 : Date.now(),
                                pausedAt: playbackState.paused_at ? playbackState.paused_at * 1000 : (elapsedTime > 0 ? Date.now() - (elapsedTime * 1000) : null),
                                isPaused: true // Always start paused
                            };
                        } else {
                            // File doesn't exist - clear currentSong and reset playback state
                            this.state.currentSong = null;
                            this.state.isPlaying = false;
                            this.state.isPaused = false;
                            // Clear playback state in database
                            try {
                                dbService.updatePlaybackState({
                                    current_song_id: null,
                                    is_playing: 0,
                                    is_paused: 0
                                });
                            } catch (e) {
                                logger.error('Failed to clear playback state:', e);
                            }
                        }
                    }
                }
            }
            this.loaded = true;
        } catch (e) {
            logger.error('Failed to load playback state:', e);
        }
        
        return this.state;
    }

    /**
     * Get current state
     * @returns {Object} Current state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Update state (runtime updates, not persisted yet)
     * @param {Object} updates - State updates
     */
    updateState(updates) {
        Object.assign(this.state, updates);
    }

    /**
     * Save state to database (with debouncing to batch rapid changes)
     * @param {Object} state - State to save (optional, uses current state if not provided)
     * @param {boolean} immediate - If true, save immediately without debouncing
     */
    save(state, immediate = false) {
        // Update internal state if provided
        if (state) {
            this.updateState(state);
        }
        
        if (immediate) {
            clearTimeout(this.debounceTimer);
            this._saveNow();
        } else {
            // Debounce saves to batch rapid changes
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this._saveNow();
            }, this.debounceDelay);
        }
    }
    
    /**
     * Internal method to perform the actual save
     */
    _saveNow() {
        try {
            const stateToSave = this.state;
            dbService.updatePlaybackState({
                is_playing: stateToSave.isPlaying ? 1 : 0,
                is_paused: stateToSave.isPaused ? 1 : 0,
                current_song_id: stateToSave.currentSong ? dbService.getOrCreateSong({
                    content: stateToSave.currentSong.content,
                    title: stateToSave.currentSong.title,
                    artist: stateToSave.currentSong.artist,
                    channel: stateToSave.currentSong.channel,
                    duration: stateToSave.currentSong.duration,
                    thumbnail_path: stateToSave.currentSong.thumbnail,
                    thumbnail_url: stateToSave.currentSong.thumbnailUrl
                }) : null,
                start_time: stateToSave.currentSong?.startTime ? Math.floor(stateToSave.currentSong.startTime / 1000) : null,
                paused_at: stateToSave.currentSong?.pausedAt ? Math.floor(stateToSave.currentSong.pausedAt / 1000) : null,
                seek_position: stateToSave.currentSong?.elapsed || null,
                songs_played: stateToSave.songsPlayed || 0
            });
        } catch (e) {
            logger.error('Failed to save playback state:', e);
        }
    }
}

module.exports = new PlaybackStateService();

