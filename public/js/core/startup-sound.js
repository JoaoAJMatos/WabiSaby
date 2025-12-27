/**
 * Startup Sound Module
 * Handles playing the startup sound when the loading screen appears
 * and provides utilities to wait for sound completion before redirecting
 */

(function() {
    'use strict';
    
    let startupSoundPlayed = false;
    let startupAudio = null;
    let soundFinished = false;
    let soundDuration = null;
    let onSoundEndCallbacks = [];
    
    /**
     * Initialize and start the startup sound
     * @param {string} soundPath - Path to the startup sound file
     * @param {boolean} waitForCompletion - Whether to track completion for redirect delays
     */
    function initStartupSound(soundPath, waitForCompletion = false) {
        if (startupAudio) return; // Already initialized
        
        try {
            startupAudio = new Audio(soundPath);
            startupAudio.volume = 0.5; // Set volume to 50% to avoid being too loud
            startupAudio.preload = 'auto'; // Aggressive preloading
            
            // Track when sound starts playing
            startupAudio.addEventListener('play', () => {
                startupSoundPlayed = true;
                console.log('✓ Startup sound started playing');
            }, { once: true });
            
            // Track when sound ends - for redirect delays
            if (waitForCompletion) {
                startupAudio.addEventListener('ended', () => {
                    soundFinished = true;
                    console.log('✓ Startup sound finished playing');
                    // Notify all callbacks that sound has ended
                    onSoundEndCallbacks.forEach(callback => {
                        try {
                            callback();
                        } catch (e) {
                            console.error('Error in sound end callback:', e);
                        }
                    });
                    onSoundEndCallbacks = []; // Clear callbacks
                }, { once: true });
                
                // Get duration when metadata loads (fires very early)
                startupAudio.addEventListener('loadedmetadata', () => {
                    soundDuration = startupAudio.duration;
                    console.log(`Startup sound duration: ${soundDuration.toFixed(2)}s`);
                }, { once: true });
            }
            
            // Try to play immediately - browser will buffer automatically
            // This is the fastest way to start playback
            playStartupSound();
            
            // Also try when loadstart fires (fires immediately when loading begins)
            startupAudio.addEventListener('loadstart', () => {
                console.log('Startup sound loading started - attempting to play');
                playStartupSound();
            }, { once: true });
            
            // Try when we have enough data to start (fires early, before full load)
            startupAudio.addEventListener('canplay', () => {
                console.log('Startup sound can play - attempting to start');
                playStartupSound();
            }, { once: true });
            
            // Also try when loadeddata fires (backup)
            startupAudio.addEventListener('loadeddata', () => {
                console.log('Startup sound data loaded - attempting to start');
                playStartupSound();
            }, { once: true });
            
            // Handle errors
            startupAudio.addEventListener('error', (e) => {
                console.error('Startup sound error:', e);
                console.error('Audio error details:', startupAudio.error);
                if (waitForCompletion) {
                    soundFinished = true; // Don't block redirect on error
                }
            });
            
            // Load the audio immediately (triggers loadstart)
            startupAudio.load();
        } catch (error) {
            console.error('Failed to create startup sound:', error);
            if (waitForCompletion) {
                soundFinished = true; // Don't block redirect on error
            }
        }
    }
    
    /**
     * Attempt to play the startup sound
     */
    function playStartupSound() {
        // Only play once
        if (startupSoundPlayed || !startupAudio) {
            return;
        }
        
        try {
            // Try to play immediately
            const playPromise = startupAudio.play();
            
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log('✓ Startup sound playing successfully');
                        startupSoundPlayed = true;
                    })
                    .catch(err => {
                        // Autoplay was blocked - will play on user interaction
                        console.log('⚠ Startup sound autoplay blocked:', err.message);
                        console.log('   Sound will play on first user interaction');
                    });
            }
        } catch (error) {
            console.error('Startup sound play error:', error);
        }
    }
    
    /**
     * Setup user interaction fallback for autoplay restrictions
     */
    function setupInteractionFallback() {
        const playOnInteraction = (event) => {
            if (!startupSoundPlayed) {
                console.log('User interaction detected, playing startup sound...');
                playStartupSound();
            }
        };
        
        // Listen for various user interactions
        ['click', 'touchstart', 'keydown', 'mousedown'].forEach(event => {
            document.addEventListener(event, playOnInteraction, { once: true, passive: true });
        });
        
        // Also make the loading overlay clickable
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.addEventListener('click', playOnInteraction, { once: true, passive: true });
            loadingOverlay.style.cursor = 'pointer'; // Show it's clickable
        }
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
            setupInteractionFallback();
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

