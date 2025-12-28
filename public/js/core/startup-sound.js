/**
 * Startup Sound Module
 * Handles playing the startup sound when the loading screen appears
 * and provides utilities to wait for sound completion before redirecting
 */

(function() {
    'use strict';
    
    const SESSION_STORAGE_KEY = 'wabisaby_startup_sound_played';
    
    let startupSoundPlayed = false;
    let soundFinished = false;
    let soundDuration = null;
    let onSoundEndCallbacks = [];
    
    /**
     * Check if startup sound has already been played in this session
     * @returns {boolean}
     */
    function hasSoundBeenPlayed() {
        try {
            return sessionStorage.getItem(SESSION_STORAGE_KEY) === 'true';
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Mark startup sound as played in session storage
     */
    function markSoundAsPlayed() {
        try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, 'true');
        } catch (e) {
            // Ignore errors (e.g., private browsing mode)
        }
    }
    
    /**
     * Initialize and start the startup sound
     * @param {string} soundPath - Path to the startup sound file (not used for backend playback)
     * @param {boolean} waitForCompletion - Whether to track completion for redirect delays
     */
    function initStartupSound(soundPath, waitForCompletion = false) {
        // Check if sound has already been played in this session
        if (hasSoundBeenPlayed()) {
            console.log('Startup sound already played in this session - skipping');
            startupSoundPlayed = true;
            soundFinished = true;
            return;
        }
        
        fetch('/api/startup-sound/play', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('✓ Startup sound playing on backend');
                startupSoundPlayed = true;
                markSoundAsPlayed();
                
                // If we need to wait for completion, estimate duration
                // (we can't track backend playback completion easily, so just mark as finished after a delay)
                if (waitForCompletion) {
                    // Estimate sound duration (you can adjust this based on your actual sound file)
                    const estimatedDuration = 2000; // 2 seconds default
                    soundDuration = estimatedDuration / 1000;
                    setTimeout(() => {
                        soundFinished = true;
                        console.log('✓ Startup sound finished playing');
                        onSoundEndCallbacks.forEach(callback => {
                            try {
                                callback();
                            } catch (e) {
                                console.error('Error in sound end callback:', e);
                            }
                        });
                        onSoundEndCallbacks = [];
                    }, estimatedDuration);
                } else {
                    soundFinished = true;
                }
            } else {
                console.warn('Failed to play startup sound:', data.error);
                startupSoundPlayed = true;
                soundFinished = true;
                markSoundAsPlayed();
            }
        })
        .catch(error => {
            console.error('Error playing startup sound:', error);
            startupSoundPlayed = true;
            soundFinished = true;
            markSoundAsPlayed();
        });
    }
    
    /**
     * Wait for sound to finish playing (for redirect delays)
     * @returns {Promise<void>}
     */
    async function waitForSoundCompletion() {
        // If already finished, return immediately
        if (soundFinished) {
            return;
        }
        
        // Return a promise that resolves when sound ends
        return new Promise((resolve) => {
            // If sound already finished, resolve immediately
            if (soundFinished) {
                resolve();
                return;
            }
            
            // Add callback to be called when sound ends
            onSoundEndCallbacks.push(() => {
                resolve();
            });
            
            // Safety timeout: if sound duration is known, use it + small buffer
            // Otherwise use a reasonable max timeout
            const timeout = soundDuration ? (soundDuration * 1000) + 200 : 10000;
            setTimeout(() => {
                if (!soundFinished) {
                    console.warn('Sound completion timeout - proceeding anyway');
                    soundFinished = true; // Mark as finished to prevent blocking
                    resolve();
                }
            }, timeout);
        });
    }
    
    /**
     * Public API
     */
    window.StartupSound = {
        /**
         * Initialize the startup sound
         * @param {string} soundPath - Path to the startup sound file (e.g., 'assets/startup-sound.mp3' or '../assets/startup-sound.mp3')
         * @param {Object} options - Configuration options
         * @param {boolean} options.waitForCompletion - Whether to track completion for redirect delays (default: false)
         */
        init: function(soundPath, options = {}) {
            const waitForCompletion = options.waitForCompletion || false;
            initStartupSound(soundPath, waitForCompletion);
        },
        
        /**
         * Wait for sound to finish playing (useful before redirecting)
         * @returns {Promise<void>}
         */
        waitForCompletion: waitForSoundCompletion,
        
        /**
         * Check if sound has finished playing
         * @returns {boolean}
         */
        isFinished: function() {
            return soundFinished;
        },
        
        /**
         * Get sound duration in seconds
         * @returns {number|null}
         */
        getDuration: function() {
            return soundDuration;
        },
        
        /**
         * Register a callback to be called when sound ends
         * @param {Function} callback - Function to call when sound ends
         */
        onSoundEnd: function(callback) {
            if (soundFinished) {
                // Sound already finished, call immediately
                callback();
            } else {
                // Add to callbacks list
                onSoundEndCallbacks.push(callback);
            }
        }
    };
})();

