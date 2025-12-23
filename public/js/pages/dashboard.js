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
let currentAuthState = {
    isConnected: false,
    actionRequired: false
};

// Groups count tracking for onboarding hints
let groupsCount = 0;

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
            
            // Store current auth state for use in menu toggle
            currentAuthState = {
                isConnected: data.auth.isConnected || false,
                actionRequired: data.auth.actionRequired || false
            };
            
            // Track groups count for onboarding hints
            if (typeof data.auth.groupsCount !== 'undefined') {
                groupsCount = data.auth.groupsCount;
                // Update onboarding hints based on groups count
                updateGroupConfigurationHints(groupsCount, currentAuthState.isConnected);
            }
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
                const playTitle = window.i18n?.tSync('ui.dashboard.nowPlaying.play') || 'Play';
                playPauseBtn.setAttribute('title', playTitle);
            } else {
                playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                playPauseBtn.setAttribute('data-paused', 'false');
                const pauseTitle = window.i18n?.tSync('ui.dashboard.nowPlaying.pause') || 'Pause';
                playPauseBtn.setAttribute('title', pauseTitle);
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
            let loadingText = '';
            let loadingI18nKey = '';
            let loadingI18nParams = null;
            if (currentSong.downloadStatus) {
                if (currentSong.downloadStatus === 'downloading') {
                    const progress = Math.round(currentSong.downloadProgress || 0);
                    loadingI18nKey = 'ui.dashboard.queue.downloading';
                    loadingI18nParams = { progress };
                    loadingText = window.i18n?.tSync(loadingI18nKey, loadingI18nParams) || `Downloading ${progress}%`;
                } else {
                    loadingI18nKey = `ui.dashboard.queue.status.${currentSong.downloadStatus}`;
                    loadingText = window.i18n?.tSync(loadingI18nKey) || 
                        (currentSong.downloadStatus.charAt(0).toUpperCase() + currentSong.downloadStatus.slice(1) + '...');
                }
            } else {
                loadingI18nKey = 'ui.dashboard.queue.preparingAudio';
                loadingText = window.i18n?.tSync(loadingI18nKey) || "Preparing audio...";
            }
            
            const progress = currentSong.downloadProgress || 0;
            
            // Build data attributes for i18n
            const loadingDataAttrs = loadingI18nKey ? `data-i18n="${loadingI18nKey}"` : '';
            const loadingDataParams = loadingI18nParams ? `data-i18n-params='${JSON.stringify(loadingI18nParams)}'` : '';
            
            currentSongContainer.innerHTML = `
                <div class="np-title">${title}</div>
                ${artist ? `<div class="np-artist">${artist}</div>` : ''}
                ${showRequesterNameEnabled ? `<div class="np-requester">
                    <i class="fas fa-user"></i>
                    ${requester}
                </div>` : ''}
                <div class="np-loading-state">
                    <i class="fas fa-circle-notch np-loading-spinner"></i>
                    <span ${loadingDataAttrs} ${loadingDataParams}>${loadingText}</span>
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
        const readyToPlayText = window.i18n?.tSync('ui.dashboard.nowPlaying.readyToPlay') || 'READY TO PLAY';
        const addTrackHintText = window.i18n?.tSync('ui.dashboard.nowPlaying.addTrackHint') || 'Add a track to get started';
        currentSongContainer.innerHTML = `
            <div class="np-idle-state">
                <span class="np-idle-label" data-i18n="ui.dashboard.nowPlaying.readyToPlay">${readyToPlayText}</span>
                <p class="np-idle-hint" data-i18n="ui.dashboard.nowPlaying.addTrackHint">${addTrackHintText}</p>
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
            const noSongTitle = window.i18n?.tSync('ui.dashboard.nowPlaying.noSongPlaying') || 'No song playing';
            playPauseBtn.setAttribute('title', noSongTitle);
        }
    }

    // Update Queue List
    const queueList = document.getElementById('queue-list');
    const queueCount = document.getElementById('queue-count');
    queueList.innerHTML = '';
    queueCount.textContent = queue.length;
    
    if (queue.length === 0) {
        const queueEmptyText = window.i18n?.tSync('ui.dashboard.queue.queueEmpty') || 'Queue empty';
        queueList.innerHTML = `
            <li class="queue-item queue-empty">
                <span>${queueEmptyText}</span>
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
                const failedText = window.i18n?.tSync('ui.dashboard.queue.status.failed') || 'FAILED';
                statusHTML = `<div class="status-badge-small error"><i class="fas fa-exclamation-triangle"></i> <span data-i18n="ui.dashboard.queue.status.failed">${failedText}</span></div>`;
            } else if (item.type === 'url' && item.downloading) {
                const progress = item.downloadProgress || 0;
                const status = item.downloadStatus || 'waiting';
                const statusKey = `ui.dashboard.queue.status.${status}`;
                const statusText = window.i18n?.tSync(statusKey) || status.toUpperCase();
                
                statusHTML = `
                    <div class="download-status">
                        <div class="status-text" data-i18n="${statusKey}">${statusText}</div>
                        <div class="progress-bar-small">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <div class="progress-percent">${Math.round(progress)}%</div>
                    </div>
                `;
            } else if (item.type === 'file' || item.downloadStatus === 'ready') {
                const readyText = window.i18n?.tSync('ui.dashboard.queue.status.ready') || 'READY';
                statusHTML = `<div class="status-badge-small ready"><i class="fas fa-check-circle"></i> <span data-i18n="ui.dashboard.queue.status.ready">${readyText}</span></div>`;
            } else if (item.type === 'url') {
                const queuedText = window.i18n?.tSync('ui.dashboard.queue.status.queued') || 'QUEUED';
                statusHTML = `<div class="status-badge-small queued"><i class="fas fa-circle"></i> <span data-i18n="ui.dashboard.queue.status.queued">${queuedText}</span></div>`;
            }
            
            li.innerHTML = `
                <div class="drag-handle">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                ${item.thumbnailUrl ? `<div class="queue-thumbnail"><img src="${item.thumbnailUrl}" alt="" draggable="false"></div>` : ''}
                <div class="song-info">
                    <span class="song-title">
                        ${title}
                        ${item.isPriority ? '<i class="fas fa-crown queue-priority-icon"></i>' : ''}
                    </span>
                    ${artist ? `<span class="song-artist">${artist}</span>` : ''}
                    <span class="song-requester">
                        <i class="fas fa-user"></i>
                        ${requester}
                    </span>
                </div>
                <div class="queue-position">${index + 1}</div>
                ${statusHTML}
                <button onclick="removeSong(${index})" class="queue-remove-btn" draggable="false" title="${window.i18n?.tSync('ui.dashboard.queue.removeFromQueue') || 'Remove from queue'}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            // Prevent images from being draggable (they interfere with drag and drop)
            const images = li.querySelectorAll('img');
            images.forEach(img => {
                img.setAttribute('draggable', 'false');
            });

            // Special handling for remove button - don't start drag when clicking it
            const removeBtn = li.querySelector('.queue-remove-btn');
            if (removeBtn) {
                removeBtn.setAttribute('draggable', 'false');
            }
            
            // Ensure drag handle has proper cursor style
            const dragHandle = li.querySelector('.drag-handle');
            if (dragHandle) {
                dragHandle.style.cursor = 'grab';
            }
            
            // Make sure the entire queue item is draggable, not just specific parts
            // Set cursor on the entire item
            li.style.cursor = 'grab';

            // Add mousedown handler for mouse-based drag
            li.addEventListener('mousedown', (e) => {
                // Don't start drag if clicking on remove button
                if (e.target.closest('.queue-remove-btn')) {
                    return;
                }

                // Start mouse-based drag
                startMouseDrag(e, li);
            });

            // Prevent HTML5 drag/drop from interfering
            li.setAttribute('draggable', 'false');
            li.addEventListener('dragstart', (e) => {
                e.preventDefault();
                return false;
            });
            
            queueList.appendChild(li);
        });
    }
    
    // Update Skip Button - disable if no next song in queue
    const skipBtn = document.getElementById('skip-btn');
    if (skipBtn) {
        const hasNextSong = queue.length > 0;
        if (!hasNextSong) {
            skipBtn.disabled = true;
            const noSongsTitle = window.i18n?.tSync('ui.dashboard.queue.noSongsInQueue') || 'No songs in queue';
            skipBtn.setAttribute('title', noSongsTitle);
            skipBtn.classList.add('disabled');
        } else {
            skipBtn.disabled = false;
            const skipTitle = window.i18n?.tSync('ui.dashboard.nowPlaying.skip') || 'Skip';
            skipBtn.setAttribute('title', skipTitle);
            skipBtn.classList.remove('disabled');
        }
    }
    
    // Update Prefetch Button - disable if queue is empty
    const prefetchBtn = document.getElementById('prefetch-btn');
    if (prefetchBtn) {
        if (queue.length === 0) {
            prefetchBtn.disabled = true;
            const queueEmptyTitle = window.i18n?.tSync('ui.dashboard.queue.queueIsEmpty') || 'Queue is empty';
            prefetchBtn.setAttribute('title', queueEmptyTitle);
            prefetchBtn.classList.add('disabled');
        } else {
            prefetchBtn.disabled = false;
            const downloadAllTitle = window.i18n?.tSync('ui.dashboard.queue.downloadAllSongs') || 'Download all songs in queue';
            prefetchBtn.setAttribute('title', downloadAllTitle);
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

/**
 * Update group configuration hints at all levels
 * @param {number} count - Current groups count
 * @param {boolean} isConnected - Whether WhatsApp is connected
 */
function updateGroupConfigurationHints(count, isConnected) {
    // Only show hints if connected and no groups configured
    const shouldShowHints = isConnected && count === 0;
    
    // Check if burger menu is open
    const burgerWrapper = document.querySelector('.burger-menu-wrapper');
    const isMenuOpen = burgerWrapper && burgerWrapper.classList.contains('menu-open');
    
    // Level 1: Burger Menu Button Hint (only show when menu is closed)
    const burgerBtn = document.getElementById('burger-menu-btn');
    if (burgerBtn) {
        if (shouldShowHints && !isMenuOpen) {
            burgerBtn.classList.add('burger-menu-has-hint');
        } else {
            burgerBtn.classList.remove('burger-menu-has-hint');
        }
    }
    
    // Level 2: Settings Button Badge (only show when menu is open)
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        // Always remove existing badge first
        const existingBadge = settingsBtn.querySelector('.settings-btn-badge');
        if (existingBadge) {
            existingBadge.remove();
        }
        settingsBtn.classList.remove('settings-btn-has-hint');
        
        // Only add badge if menu is open and hints should be shown
        if (shouldShowHints && isMenuOpen) {
            // Create and add badge
            const badge = document.createElement('span');
            badge.className = 'settings-btn-badge';
            const actionRequiredLabel = window.i18n?.tSync('ui.dashboard.nav.actionRequired') || 'ACTION REQUIRED';
            badge.setAttribute('aria-label', `${actionRequiredLabel}: Configure groups`);
            badge.innerHTML = '<i class="fas fa-exclamation"></i>';
            settingsBtn.appendChild(badge);
            settingsBtn.classList.add('settings-btn-has-hint');
        }
    }
    
    // Level 3: Groups Nav Item Breathing Border (in Settings Sidebar)
    const groupsNavItem = document.querySelector('.settings-nav-item[data-category="groups"]');
    if (groupsNavItem) {
        if (shouldShowHints) {
            groupsNavItem.classList.add('nav-item-has-hint');
        } else {
            groupsNavItem.classList.remove('nav-item-has-hint');
        }
    }
    
    // Store groups count globally for access by other modules
    window.groupsCount = count;
}

// Logout function - disconnects from WhatsApp, clears auth data, and redirects
function logout() {
    // Show confirmation modal before logging out
    const logoutTitle = window.i18n?.tSync('ui.dashboard.logout') || window.i18n?.tSync('ui.dashboard.nav.logout') || 'Logout';
    const logoutMessage = window.i18n?.tSync('ui.dashboard.logoutConfirm') || 'Are you sure you want to logout? This will disconnect from WhatsApp and clear all authentication data.';
    showConfirmationModal({
        title: logoutTitle,
        message: logoutMessage,
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
        
        // Update hints immediately when menu state changes
        // Use stored auth state instead of reading from DOM
        if (typeof updateGroupConfigurationHints === 'function' && typeof groupsCount !== 'undefined') {
            updateGroupConfigurationHints(groupsCount, currentAuthState.isConnected);
        }
    }
    
    function closeMenu() {
        if (burgerMenuOpen) {
            burgerMenuOpen = false;
            burgerWrapper.classList.remove('menu-open');
            burgerBtn.setAttribute('aria-expanded', 'false');
            
            // Update hints immediately when menu closes
            // Use stored auth state instead of reading from DOM
            if (typeof updateGroupConfigurationHints === 'function' && typeof groupsCount !== 'undefined') {
                updateGroupConfigurationHints(groupsCount, currentAuthState.isConnected);
            }
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
loadVolume();
initSettingsListeners();
initEffectsListeners();
initVolumeListeners();
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

// Spacebar keyboard shortcut for play/pause
document.addEventListener('keydown', (e) => {
    // Only trigger on spacebar
    if (e.key !== ' ' && e.code !== 'Space') {
        return;
    }
    
    // Don't trigger if user is typing in an input field, textarea, or contenteditable element
    const activeElement = document.activeElement;
    const isInputField = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable ||
        activeElement.contentEditable === 'true'
    );
    
    // Don't trigger if a modal is open (user might be interacting with it)
    const isModalOpen = document.querySelector('.modal-overlay.active') !== null;
    
    if (!isInputField && !isModalOpen) {
        e.preventDefault(); // Prevent page scroll
        togglePause();
    }
});

// Setup seek functionality (will be called after DOM is ready)
setupSeekFunctionality();

// Initialize VIP area unlock state
/**
 * Update all dashboard translations based on current language
 * Finds all elements with data-i18n attributes and updates their text
 * Made globally accessible for use in other modules
 */
function updateDashboardTranslations() {
    if (!window.i18n || !window.i18n.tSync) {
        console.warn('i18n not available, skipping translation update');
        return;
    }
    
    // Update elements with data-i18n (text content)
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (!key) return;
        
        // Check for parameters
        const paramsAttr = element.getAttribute('data-i18n-params');
        let params = null;
        if (paramsAttr) {
            try {
                params = JSON.parse(paramsAttr);
            } catch (e) {
                console.warn('Failed to parse data-i18n-params:', paramsAttr);
            }
        }
        
        const translation = params ? window.i18n.tSync(key, params) : window.i18n.tSync(key);
        if (translation && translation !== key) {
            // Skip input/textarea elements (they use placeholders, handled separately)
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                return;
            }
            
            // Check if element contains icons - preserve them
            const hasIcons = element.querySelector('i') !== null;
            
            if (hasIcons) {
                // Element has icons - find the text span or text node to update
                // Look for a span that doesn't contain icons
                const textSpan = Array.from(element.querySelectorAll('span')).find(span => 
                    !span.querySelector('i') && 
                    !span.classList.contains('icon') &&
                    !span.classList.contains('badge') &&
                    span.getAttribute('data-i18n') === key
                );
                
                if (textSpan) {
                    // Update the span that has the data-i18n attribute
                    textSpan.textContent = translation;
                } else {
                    // Look for any text span without icons
                    const anyTextSpan = element.querySelector('span:not([class*="icon"]):not([class*="badge"])');
                    if (anyTextSpan && !anyTextSpan.querySelector('i')) {
                        anyTextSpan.textContent = translation;
                    } else {
                        // Update text nodes, preserving icons
                        const textNodes = Array.from(element.childNodes).filter(node => 
                            node.nodeType === Node.TEXT_NODE
                        );
                        if (textNodes.length > 0) {
                            // Update first text node
                            textNodes[0].textContent = ' ' + translation;
                        }
                    }
                }
            } else {
                // No icons - safe to update textContent
                element.textContent = translation;
            }
        }
    });
    
    // Update elements with data-i18n-title (title attribute)
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        if (!key) return;
        
        const translation = window.i18n.tSync(key);
        if (translation && translation !== key) {
            element.setAttribute('title', translation);
        }
    });
    
    // Update elements with data-i18n-placeholder (placeholder attribute)
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        if (!key) return;
        
        const translation = window.i18n.tSync(key);
        if (translation && translation !== key) {
            element.setAttribute('placeholder', translation);
        }
    });
    
    // Update elements with data-i18n-aria-label (aria-label attribute)
    document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
        const key = element.getAttribute('data-i18n-aria-label');
        if (!key) return;
        
        const translation = window.i18n.tSync(key);
        if (translation && translation !== key) {
            element.setAttribute('aria-label', translation);
        }
    });
    
    // Update play/pause button title dynamically
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
        const isPaused = playPauseBtn.getAttribute('data-paused') === 'true';
        const titleKey = isPaused ? 'ui.dashboard.nowPlaying.play' : 'ui.dashboard.nowPlaying.pause';
        playPauseBtn.setAttribute('title', window.i18n.tSync(titleKey));
    }
    
    // Update effects mode label
    const effectsModeLabel = document.getElementById('effects-mode-label');
    if (effectsModeLabel) {
        // Use data-i18n attribute if available, otherwise check text content
        const i18nKey = effectsModeLabel.getAttribute('data-i18n');
        if (i18nKey) {
            effectsModeLabel.textContent = window.i18n.tSync(i18nKey);
        } else {
            // Fallback: check text content
            const isAdvanced = effectsModeLabel.textContent.trim().toLowerCase() === 'advanced' || 
                              effectsModeLabel.textContent.trim().toLowerCase() === 'avançado';
            const modeKey = isAdvanced ? 'ui.dashboard.effects.advanced' : 'ui.dashboard.effects.simple';
            effectsModeLabel.textContent = window.i18n.tSync(modeKey);
        }
    }
    
    // Update effects expand/collapse button title
    const effectsExpandBtn = document.getElementById('effects-expand-btn');
    if (effectsExpandBtn) {
        const isExpanded = document.getElementById('effects-expanded-content')?.style.display !== 'none';
        const titleKey = isExpanded ? 'ui.dashboard.effects.collapseEffects' : 'ui.dashboard.effects.expandEffects';
        effectsExpandBtn.setAttribute('title', window.i18n.tSync(titleKey));
    }
    
    // Update stats collapse button title
    const statsCollapseBtn = document.getElementById('stats-collapse-btn');
    if (statsCollapseBtn) {
        const isCollapsed = document.getElementById('stats')?.classList.contains('collapsed');
        const titleKey = isCollapsed ? 'ui.dashboard.analytics.expandAnalytics' : 'ui.dashboard.analytics.collapseAnalytics';
        statsCollapseBtn.setAttribute('title', window.i18n.tSync(titleKey));
    }
}

// Make function globally accessible
window.updateDashboardTranslations = updateDashboardTranslations;

// Listen for language change events
window.addEventListener('languageChanged', async (event) => {
    await updateDashboardTranslations();
    // Update any dynamically set text that might have been missed
    // Re-fetch data to update queue UI with translations
    fetchData();
});

// VIP Password Setup Functions
async function checkVipPasswordSetup() {
    try {
        const response = await fetch('/api/vip-auth/status');
        const data = await response.json();
        
        if (!data.configured) {
            // Show onboarding modal
            showVipPasswordSetupModal();
        }
    } catch (error) {
        console.error('Error checking VIP password status:', error);
    }
}

// VIP Password Setup Modal
function showVipPasswordSetupModal() {
    const modal = document.createElement('div');
    modal.className = 'vip-setup-modal';
    modal.innerHTML = `
        <div class="vip-setup-card">
            <div class="vip-setup-header">
                <div class="vip-setup-icon">
                    <i class="fas fa-shield-alt"></i>
                </div>
                <div class="vip-setup-text">
                    <h3>VIP Management Setup</h3>
                    <p>Set up a password to secure VIP management access</p>
                </div>
            </div>
            <form id="vip-setup-form" class="vip-setup-form">
                <div class="vip-password-input-wrapper">
                    <i class="fas fa-key"></i>
                    <input type="password" id="vip-setup-password" 
                           placeholder="Enter password (min 6 characters)" 
                           required minlength="6" autocomplete="new-password">
                    <button type="button" class="vip-password-toggle"
                            onclick="toggleVipSetupPasswordVisibility()">
                        <i class="fas fa-eye" id="vip-setup-password-eye"></i>
                    </button>
                </div>
                <div class="vip-password-input-wrapper">
                    <i class="fas fa-key"></i>
                    <input type="password" id="vip-setup-password-confirm" 
                           placeholder="Confirm password" 
                           required minlength="6" autocomplete="new-password">
                </div>
                <p class="vip-password-error" id="vip-setup-error"></p>
                <button type="submit" class="vip-setup-btn">
                    <i class="fas fa-check"></i>
                    <span>Set Password</span>
                </button>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle form submission
    document.getElementById('vip-setup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const password = document.getElementById('vip-setup-password').value;
        const confirmPassword = document.getElementById('vip-setup-password-confirm').value;
        const errorEl = document.getElementById('vip-setup-error');
        
        if (password !== confirmPassword) {
            errorEl.textContent = 'Passwords do not match';
            return;
        }
        
        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters';
            return;
        }
        
        try {
            const response = await fetch('/api/vip-auth/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                modal.remove();
                showNotification('VIP password configured successfully', 'success');
            } else {
                errorEl.textContent = data.error || 'Failed to set password';
            }
        } catch (error) {
            console.error('Error setting VIP password:', error);
            errorEl.textContent = 'Error setting password. Please try again.';
        }
    });
}

function toggleVipSetupPasswordVisibility() {
    const passwordInput = document.getElementById('vip-setup-password');
    const eyeIcon = document.getElementById('vip-setup-password-eye');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
    }
}

// Make function globally accessible
window.toggleVipSetupPasswordVisibility = toggleVipSetupPasswordVisibility;

initializeVipArea();
// Check VIP password setup after initialization
checkVipPasswordSetup();

// Polling interval handles both queue updates and auth checks
setInterval(fetchData, 2000);

// Update progress bar and stats every second for smoother updates
setInterval(updateProgressBarAndStats, 1000);

// Initial fetch (will hide loading screen on success)
fetchData();

// Initialize translations after i18n is ready
if (window.i18n) {
    window.i18n.init().then(() => {
        updateDashboardTranslations();
    });
} else {
    // Wait for i18n to load
    document.addEventListener('DOMContentLoaded', () => {
        if (window.i18n) {
            window.i18n.init().then(() => {
                updateDashboardTranslations();
            });
        }
    });
}

