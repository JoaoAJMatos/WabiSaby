// Note: API_URL, VIP_ADMIN_PASSWORD, and VIP_UNLOCK_KEY are defined in config.js

// Store current song data for local progress updates (global for audio.js access)
var localCurrentSong = null;
let serverStats = null;
let statsReceivedAt = null;

// Listen for seek requests from fullscreen player
async function handleSeekRequest(newTime) {
    // Update frontend audio element immediately for responsive UI
    if (currentAudio && !isNaN(newTime) && isFinite(newTime)) {
        const newTimeSeconds = newTime / 1000; // convert to seconds
        currentAudio.currentTime = newTimeSeconds;
    }
    
    // Send seek request to backend
    try {
        const response = await fetch('/api/queue/seek', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ time: newTime })
        });
        
        if (response.ok) {
            console.log(`Seeking to ${formatTime(newTime)}`);
            // Refresh data to get updated state
            fetchData();
        } else {
            console.error('Seek failed:', await response.text());
        }
    } catch (error) {
        console.error('Error seeking:', error);
    }
}

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SEEK_REQUEST') {
        handleSeekRequest(event.data.time);
    }
});

// Also listen via broadcast channel
broadcast.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SEEK_REQUEST') {
        handleSeekRequest(event.data.time);
    }
});

// Note: Tab check is handled in broadcast.js

// Note: audioContext, analyser, source, currentAudio, lastPlayedSong, isVisualizerRunning,
//       playbackRetryCount, idleAnimationFrame, isShowingIdle, barCurrentHeights, 
//       barTargetHeights are defined in audio.js
// Note: BAR_COUNT, LERP_SPEED, MAX_PLAYBACK_RETRIES are defined in config.js
// Note: lerp function is defined in utils.js

// Note: All VIP-related functionality (isVipUnlocked, vipInactivityTimer, 
//       initializeVipArea, unlockVipArea, unlockVipAreaUI, lockVipArea,
//       startVipInactivityTimer, stopVipInactivityTimer, resetVipInactivityTimer,
//       setupVipActivityListeners, toggleVipPasswordVisibility) is defined in vip.js

// Note: startAudioPlayback, ensureAudioPlaying, unlockAudio, and all audio-related
//       event listeners are defined in audio.js

// Auth status tracking
let authStatusReceived = false;

async function fetchData() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        // Check auth status first - redirect if not connected
        if (data.auth && !data.auth.isConnected) {
            // Not authenticated - redirect to auth page
            window.location.href = '/pages/auth.html';
            return;
        }
        
        // Update auth UI (status badge only)
        if (data.auth) {
            updateAuthUI(data.auth);
        }
        
        // Mark auth status as received
        authStatusReceived = true;
        
        // Update other UI components
        updateQueueUI(data.queue);
        updateStatsUI(data.stats);
    } catch (error) {
        console.error('Error fetching status:', error);
    }
}

// Note: formatTime and formatUptime are defined in utils.js

// Note: updateAuthUI is defined in ui.js

function updateQueueUI(data) {
    const { queue, currentSong } = data;
    
    const currentSongContainer = document.getElementById('current-song-info');
    const progressSection = document.getElementById('progress-section');
    const nowPlayingCard = document.getElementById('now-playing');
    const artworkContainer = document.getElementById('np-artwork');
    
    if (currentSong) {
        // Store for local progress updates
        localCurrentSong = currentSong;
        
        const title = currentSong.title || currentSong.content || 'Unknown Title';
        const artist = currentSong.artist || '';
        const requester = currentSong.requester || 'Unknown';
        const thumbnailUrl = currentSong.thumbnailUrl;
        
        // Update background image if thumbnail exists
        if (thumbnailUrl) {
            updateBackgroundImage(thumbnailUrl);
        } else {
            clearBackgroundImage();
        }
        
        // Update album artwork
        if (artworkContainer) {
            if (thumbnailUrl) {
                artworkContainer.innerHTML = `<img src="${thumbnailUrl}" alt="${title}">`;
            } else {
                artworkContainer.innerHTML = '<i class="fas fa-compact-disc np-artwork-placeholder"></i>';
            }
        }
        
        // Update song info with new structure
        currentSongContainer.innerHTML = `
            <div class="np-title">${title}</div>
            ${artist ? `<div class="np-artist">${artist}</div>` : ''}
            ${showRequesterNameEnabled ? `<div class="np-requester">
                <i class="fas fa-user"></i>
                ${requester}
            </div>` : ''}
        `;
        
        // Add playing class to card
        if (nowPlayingCard) {
            nowPlayingCard.classList.add('playing');
        }

        // Update progress bar
        if (currentSong.elapsed !== undefined && currentSong.duration) {
            progressSection.classList.remove('hidden');
            updateProgressBarAndStats();
            updateFullscreenWindow(currentSong); // Sync info
        } else {
            progressSection.classList.add('hidden');
        }

        // Update visualizer state
        const visualizerBg = document.querySelector('.np-visualizer-bg');
        if (visualizerBg) {
            if (currentSong.streamUrl && !currentSong.isPaused) {
                visualizerBg.classList.add('active');
            } else {
                visualizerBg.classList.remove('active');
            }
        }

        // Update Play/Pause Button (icon only for new design)
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.disabled = false;
            playPauseBtn.classList.remove('disabled');
            if (currentSong.isPaused) {
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                playPauseBtn.setAttribute('data-paused', 'true');
                playPauseBtn.setAttribute('title', 'Play');
            } else {
                playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                playPauseBtn.setAttribute('data-paused', 'false');
                playPauseBtn.setAttribute('title', 'Pause');
            }
        }

        // --- Audio Visualizer Logic ---
        // Use content/filename as unique ID
        const songId = currentSong.content;
        
        // Check if we have a stream URL ready
        if (currentSong.streamUrl) {
            // Song has stream URL - set up real audio visualization
            if (lastPlayedSong !== songId) {
                lastPlayedSong = songId;
                
                // Initialize audio context if not ready (will start on user interaction)
                if (!audioContext) {
                    initVisualizer();
                }
                
                // Stop idle animation when we have real audio
                isShowingIdle = false;
                
                // Clean up previous audio properly
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.src = ''; // Release the resource
                    currentAudio = null;
                }
                if (source) {
                    source.disconnect();
                    source = null;
                }
                
                const audio = new Audio(currentSong.streamUrl);
                audio.crossOrigin = "anonymous";
                
                // CRITICAL: Connect to Web Audio API FIRST, before playing
                // Once MediaElementSource is created, ALL audio routing goes through Web Audio graph
                if (audioContext) {
                    source = audioContext.createMediaElementSource(audio);
                    source.connect(analyser);
                    // IMPORTANT: analyser is NOT connected to audioContext.destination
                    // This means the audio will be analyzed but NOT sent to speakers
                    console.log('🔇 SILENT MODE: Audio connected to analyser only (no speaker output)');
                    console.log('   Song:', currentSong.title || currentSong.content);
                }
                
                // Set volume (only affects the Web Audio graph, which isn't connected to speakers)
                audio.volume = 1.0;
                
                // Sync Logic: Seek to server's position
                const serverElapsed = currentSong.elapsed || 0;
                audio.currentTime = (serverElapsed / 1000);
                
                currentAudio = audio;

                // Handle initial state - Start playing if not paused
                if (!currentSong.isPaused) {
                    startAudioPlayback();
                }
                
                // Add event listeners for better state management
                audio.addEventListener('canplaythrough', () => {
                    console.log('Audio can play through');
                    if (localCurrentSong && !localCurrentSong.isPaused && audio.paused) {
                        startAudioPlayback();
                    }
                });
                
                audio.addEventListener('playing', () => {
                    console.log('Audio is now playing - stopping idle animation');
                    isShowingIdle = false;
                });
                
                audio.addEventListener('error', (e) => {
                    console.error('Audio error:', e);
                    // On error, show idle animation
                    isShowingIdle = true;
                    initIdleAnimation();
                });
            } else if (currentAudio && lastPlayedSong === songId) {
                // Sync pause state if song is same
                if (currentSong.isPaused && !currentAudio.paused) {
                    currentAudio.pause();
                    // Show idle animation when paused
                    isShowingIdle = true;
                    initIdleAnimation();
                } else if (!currentSong.isPaused && currentAudio.paused) {
                    // Use the robust playback function
                    startAudioPlayback();
                }
                
                // Sync time if drift is large (> 2 seconds)
                const serverElapsed = currentSong.elapsed || 0;
                const localElapsed = currentAudio.currentTime * 1000;
                if (Math.abs(serverElapsed - localElapsed) > 2000) {
                    console.log('Syncing audio time...', localElapsed, serverElapsed);
                    currentAudio.currentTime = serverElapsed / 1000;
                }
            }
        } else {
            // No stream URL yet - song is preparing/downloading
            // Keep showing idle animation but in "preparing" mode
            if (!isShowingIdle) {
                isShowingIdle = true;
                initIdleAnimation();
            }
            console.log('⏳ Song preparing, showing idle animation:', currentSong.title || currentSong.content);

            // SHOW LOADING INDICATOR IN UI
            const loadingText = currentSong.downloadStatus ? 
                (currentSong.downloadStatus === 'downloading' ? `Downloading ${Math.round(currentSong.downloadProgress || 0)}%` : 
                 currentSong.downloadStatus.charAt(0).toUpperCase() + currentSong.downloadStatus.slice(1) + '...') : 
                "Preparing audio...";
            
            const progress = currentSong.downloadProgress || 0;
            
            currentSongContainer.innerHTML = `
                <div class="np-title">${title}</div>
                ${artist ? `<div class="np-artist">${artist}</div>` : ''}
                ${showRequesterNameEnabled ? `<div class="np-requester">
                    <i class="fas fa-user"></i>
                    ${requester}
                </div>` : ''}
                <div class="np-loading-state">
                    <i class="fas fa-circle-notch np-loading-spinner"></i>
                    <span>${loadingText}</span>
                </div>
                ${(progress > 0 && currentSong.downloadStatus === 'downloading') ? `
                <div class="np-loading-progress-container">
                    <div class="np-loading-progress-bar" style="width: ${progress}%"></div>
                </div>` : ''}
            `;
        }
        
    } else {
        localCurrentSong = null;
        
        // Reset to idle state with new structure
        currentSongContainer.innerHTML = `
            <div class="np-idle-state">
                <span class="np-idle-label">READY TO PLAY</span>
                <p class="np-idle-hint">Add a track to get started</p>
            </div>
        `;
        
        // Reset artwork to placeholder
        const artworkContainer = document.getElementById('np-artwork');
        if (artworkContainer) {
            artworkContainer.innerHTML = '<i class="fas fa-compact-disc np-artwork-placeholder"></i>';
        }
        
        // Remove playing class
        const nowPlayingCard = document.getElementById('now-playing');
        if (nowPlayingCard) {
            nowPlayingCard.classList.remove('playing');
        }
        
        progressSection.classList.add('hidden');
        
        // Reset visualizer
        const visualizerBg = document.querySelector('.np-visualizer-bg');
        if (visualizerBg) visualizerBg.classList.remove('active');
        
        // Clear background when no song is playing
        clearBackgroundImage();

        // Stop current audio and show idle animation
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.src = '';
            currentAudio = null;
            lastPlayedSong = null;
        }
        
        // Ensure idle animation is running
        if (!isShowingIdle) {
            isShowingIdle = true;
            initIdleAnimation();
        }
        
        // Disable play button when there's no song
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.disabled = true;
            playPauseBtn.classList.add('disabled');
            playPauseBtn.setAttribute('title', 'No song playing');
        }
    }

    // Update Queue List
    const queueList = document.getElementById('queue-list');
    const queueCount = document.getElementById('queue-count');
    queueList.innerHTML = '';
    queueCount.textContent = queue.length;
    
    if (queue.length === 0) {
        queueList.innerHTML = `
            <li class="queue-item queue-empty">
                <span>Queue empty</span>
            </li>`;
    } else {
        queue.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'queue-item';
            li.draggable = true;
            li.dataset.index = index;
            
            const title = item.title || item.content || 'Unknown Title';
            const artist = item.artist || '';
            const requester = item.requester || 'Unknown';
            
            // Determine status display
            let statusHTML = '';
            if (item.downloadStatus === 'error') {
                // Show error status
                statusHTML = '<div class="status-badge-small error"><i class="fas fa-exclamation-triangle"></i> FAILED</div>';
            } else if (item.type === 'url' && item.downloading) {
                const progress = item.downloadProgress || 0;
                const status = item.downloadStatus || 'waiting';
                const statusText = {
                    'preparing': 'INITIALIZING',
                    'resolving': 'FETCHING',
                    'searching': 'SEARCHING',
                    'downloading': 'LOADING',
                    'converting': 'PROCESSING',
                    'complete': 'READY',
                    'error': 'FAILED'
                };
                
                statusHTML = `
                    <div class="download-status">
                        <div class="status-text">${statusText[status] || status.toUpperCase()}</div>
                        <div class="progress-bar-small">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <div class="progress-percent">${Math.round(progress)}%</div>
                    </div>
                `;
            } else if (item.type === 'file' || item.downloadStatus === 'ready') {
                statusHTML = '<div class="status-badge-small ready"><i class="fas fa-check-circle"></i> READY</div>';
            } else if (item.type === 'url') {
                statusHTML = '<div class="status-badge-small queued"><i class="fas fa-circle"></i> QUEUED</div>';
            }
            
            li.innerHTML = `
                <div class="drag-handle">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                ${item.thumbnailUrl ? `<div class="queue-thumbnail"><img src="${item.thumbnailUrl}" alt=""></div>` : ''}
                <div class="song-info">
                    <span class="song-title">
                        <span class="queue-number">${index + 1}</span>
                        ${title}
                        ${item.isPriority ? '<i class="fas fa-crown queue-priority-icon"></i>' : ''}
                    </span>
                    ${artist ? `<span class="song-artist">${artist}</span>` : ''}
                    <span class="song-requester">
                        <i class="fas fa-user"></i>
                        ${requester}
                    </span>
                </div>
                ${statusHTML}
                <button onclick="removeSong(${index})" class="queue-remove-btn" title="Remove from queue">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            // Add drag event listeners
            li.addEventListener('dragstart', handleDragStart);
            li.addEventListener('dragend', handleDragEnd);
            li.addEventListener('dragover', handleDragOver);
            li.addEventListener('drop', handleDrop);
            li.addEventListener('dragenter', handleDragEnter);
            li.addEventListener('dragleave', handleDragLeave);
            
            queueList.appendChild(li);
        });
    }
    
    // Update Skip Button - disable if no next song in queue
    const skipBtn = document.getElementById('skip-btn');
    if (skipBtn) {
        const hasNextSong = queue.length > 0;
        if (!hasNextSong) {
            skipBtn.disabled = true;
            skipBtn.setAttribute('title', 'No songs in queue');
            skipBtn.classList.add('disabled');
        } else {
            skipBtn.disabled = false;
            skipBtn.setAttribute('title', 'Skip');
            skipBtn.classList.remove('disabled');
        }
    }
    
    // Update Prefetch Button - disable if queue is empty
    const prefetchBtn = document.getElementById('prefetch-btn');
    if (prefetchBtn) {
        if (queue.length === 0) {
            prefetchBtn.disabled = true;
            prefetchBtn.setAttribute('title', 'Queue is empty');
            prefetchBtn.classList.add('disabled');
        } else {
            prefetchBtn.disabled = false;
            prefetchBtn.setAttribute('title', 'Download all songs in queue');
            prefetchBtn.classList.remove('disabled');
        }
    }
}

function updateProgressBarAndStats() {
    // Update progress bar
    if (localCurrentSong && localCurrentSong.duration) {
        const progressSection = document.getElementById('progress-section');
        const progressBar = document.getElementById('progress-bar');
        const currentTimeEl = document.getElementById('current-time');
        const totalTimeEl = document.getElementById('total-time');
        
        if (progressSection && progressBar) {
            let currentElapsed = 0;
            
            // PRIORITY 1: Use actual audio element time (most accurate for lyrics sync)
            if (currentAudio && !currentAudio.paused && currentAudio.currentTime > 0) {
                currentElapsed = currentAudio.currentTime * 1000; // Convert seconds to ms
            }
            // PRIORITY 2: Use server elapsed time (for paused state or when audio not ready)
            else if (localCurrentSong.elapsed) {
                currentElapsed = localCurrentSong.elapsed;
            }
            // PRIORITY 3: Calculate from server start time (fallback)
            else if (!localCurrentSong.isPaused && localCurrentSong.startTime) {
                currentElapsed = Date.now() - localCurrentSong.startTime;
            }
            
            const progress = Math.min(100, (currentElapsed / localCurrentSong.duration) * 100);
            progressBar.style.width = `${progress}%`;
            currentTimeEl.textContent = formatTime(currentElapsed);
            totalTimeEl.textContent = formatTime(localCurrentSong.duration);
            
            // Update Fullscreen Window (for lyrics sync)
            updateFullscreenProgress(currentElapsed, localCurrentSong.duration, progress);
        }
    }
    
    // Update stats with local interpolation for uptime
    if (serverStats && statsReceivedAt) {
        const uptimeEl = document.getElementById('uptime-value');
        const songsPlayedEl = document.getElementById('songs-played-value');
        const queueCountEl = document.getElementById('queue-count-value');
        
        // Calculate current uptime by adding time elapsed since we received the stats
        const timeSinceUpdate = Date.now() - statsReceivedAt;
        const currentUptime = serverStats.uptime + timeSinceUpdate;
        
        if (uptimeEl) uptimeEl.textContent = formatUptime(currentUptime);
        if (songsPlayedEl) songsPlayedEl.textContent = serverStats.songsPlayed;
        if (queueCountEl) queueCountEl.textContent = serverStats.queueLength;
    }
}

// Seek functionality - handle clicks on progress bar
let seekHandlerAttached = false;
function setupSeekFunctionality() {
    const progressBarContainer = document.querySelector('.progress-bar-container');
    if (!progressBarContainer) return;
    
    // Only attach handler once
    if (seekHandlerAttached) return;
    seekHandlerAttached = true;
    
    progressBarContainer.style.cursor = 'pointer';
    progressBarContainer.addEventListener('click', async (e) => {
        if (!localCurrentSong || !localCurrentSong.duration) return;
        
        const rect = progressBarContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        const newTime = percentage * localCurrentSong.duration; // in milliseconds
        const newTimeSeconds = newTime / 1000; // convert to seconds
        
        // Update frontend audio element immediately for responsive UI
        if (currentAudio && !isNaN(newTimeSeconds) && isFinite(newTimeSeconds)) {
            currentAudio.currentTime = newTimeSeconds;
        }
        
        // Send seek request to backend
        try {
            const response = await fetch('/api/queue/seek', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ time: newTime })
            });
            
            if (response.ok) {
                console.log(`Seeking to ${formatTime(newTime)} (${newTimeSeconds.toFixed(2)}s)`);
                // Refresh data to get updated state
                fetchData();
            } else {
                console.error('Seek failed:', await response.text());
            }
        } catch (error) {
            console.error('Error seeking:', error);
        }
    });
}

// Initialize seek functionality when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSeekFunctionality);
} else {
    setupSeekFunctionality();
}

// Also try to setup when progress section becomes visible
const progressSectionObserver = new MutationObserver(() => {
    if (document.querySelector('.progress-bar-container') && !seekHandlerAttached) {
        setupSeekFunctionality();
    }
});

if (document.body) {
    progressSectionObserver.observe(document.body, { childList: true, subtree: true });
}

function updateStatsUI(stats) {
    if (!stats) return;
    
    // Store stats and timestamp for local interpolation
    serverStats = stats;
    statsReceivedAt = Date.now();
    
    // Immediately update the display
    updateProgressBarAndStats();
}

// Logout function - disconnects from WhatsApp, clears auth data, and redirects
function logout() {
    // Show confirmation modal before logging out
    showConfirmationModal({
        title: 'Logout',
        message: 'Are you sure you want to logout? This will disconnect from WhatsApp and clear all authentication data.',
        icon: 'fa-sign-out-alt',
        onConfirm: async () => {
            try {
                // Call backend to disconnect WhatsApp and remove auth data
                const response = await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || data.error || 'Logout failed');
                }

                // Clear localStorage (device fingerprint)
                localStorage.removeItem('wabisaby_device_fingerprint');
                
                // Clear sessionStorage (VIP unlock state)
                sessionStorage.removeItem('vip_area_unlocked');
                
                // Clear any other potential auth-related storage
                // Clear all localStorage items that start with 'wabisaby_'
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('wabisaby_')) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => localStorage.removeItem(key));
                
                // Clear all sessionStorage items that start with 'wabisaby_' or 'vip_'
                const sessionKeysToRemove = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key && (key.startsWith('wabisaby_') || key.startsWith('vip_'))) {
                        sessionKeysToRemove.push(key);
                    }
                }
                sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
                
                // Redirect to index.html (which will handle routing based on auth state)
                window.location.href = '/index.html';
            } catch (error) {
                console.error('Error during logout:', error);
                // Show error but still try to clear local data and redirect
                alert(`Logout error: ${error.message}. Clearing local data and redirecting...`);
                
                // Clear local storage anyway
                localStorage.removeItem('wabisaby_device_fingerprint');
                sessionStorage.removeItem('vip_area_unlocked');
                
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('wabisaby_')) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => localStorage.removeItem(key));
                
                const sessionKeysToRemove = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key && (key.startsWith('wabisaby_') || key.startsWith('vip_'))) {
                        sessionKeysToRemove.push(key);
                    }
                }
                sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
                
                // Redirect to index.html
                window.location.href = '/index.html';
            }
        }
    });
}

// Burger Menu Toggle Functionality
let burgerMenuOpen = false;

function initBurgerMenu() {
    const burgerBtn = document.getElementById('burger-menu-btn');
    const burgerWrapper = document.querySelector('.burger-menu-wrapper');
    
    if (!burgerBtn || !burgerWrapper) return;
    
    function toggleMenu() {
        burgerMenuOpen = !burgerMenuOpen;
        burgerWrapper.classList.toggle('menu-open', burgerMenuOpen);
        burgerBtn.setAttribute('aria-expanded', burgerMenuOpen.toString());
    }
    
    function closeMenu() {
        if (burgerMenuOpen) {
            burgerMenuOpen = false;
            burgerWrapper.classList.remove('menu-open');
            burgerBtn.setAttribute('aria-expanded', 'false');
        }
    }
    
    // Click handler for burger button
    burgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });
    
    // Click outside to close
    document.addEventListener('click', (e) => {
        if (burgerMenuOpen && !burgerWrapper.contains(e.target)) {
            closeMenu();
        }
    });
    
    // Keyboard support
    burgerBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleMenu();
        } else if (e.key === 'Escape' && burgerMenuOpen) {
            e.preventDefault();
            closeMenu();
            burgerBtn.focus();
        }
    });
    
    // Close menu when clicking on menu items (optional - keeps menu open for multiple actions)
    // Uncomment if you want menu to close on item click:
    // const menuItems = burgerWrapper.querySelectorAll('.burger-menu-item');
    // menuItems.forEach(item => {
    //     item.addEventListener('click', () => {
    //         setTimeout(closeMenu, 100); // Small delay for visual feedback
    //     });
    // });
}

// Initialize settings on load
loadSettings();
loadEffects();
initSettingsListeners();
initEffectsListeners();
initAddTrackModalListeners();
initConfirmationModalListeners();

// Initialize burger menu
initBurgerMenu();

// Listeners
document.getElementById('add-song-form').addEventListener('submit', addSong);
document.getElementById('skip-btn').addEventListener('click', skipSong);
document.getElementById('play-pause-btn').addEventListener('click', togglePause);
document.getElementById('add-vip-form').addEventListener('submit', addVip);
document.getElementById('fullscreen-btn').addEventListener('click', openFullscreenWindow);
document.getElementById('new-session-btn').addEventListener('click', startNewSession);
document.getElementById('prefetch-btn').addEventListener('click', prefetchAll);
document.getElementById('stats-collapse-btn').addEventListener('click', toggleStatsCollapse);
document.getElementById('logout-btn').addEventListener('click', logout);

// Setup seek functionality (will be called after DOM is ready)
setupSeekFunctionality();

// Initialize VIP area unlock state
initializeVipArea();

// Polling interval handles both queue updates and auth checks
setInterval(fetchData, 2000);

// Update progress bar and stats every second for smoother updates
setInterval(updateProgressBarAndStats, 1000);

// Initial fetch (will hide loading screen on success)
fetchData();

