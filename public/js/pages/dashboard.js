const API_URL = '/api/queue';

// VIP Admin Password (change this to your desired password)
const VIP_ADMIN_PASSWORD = 'wabisaby2025';
const VIP_UNLOCK_KEY = 'vip_area_unlocked';

// Store current song data for local progress updates
let localCurrentSong = null;
let serverStats = null;
let statsReceivedAt = null;

// Communication Channel for Fullscreen Player
const broadcast = new BroadcastChannel('wabisaby_audio_channel');

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

// Warn if multiple tabs are open (can cause audio overlap)
const tabId = 'dashboard_' + Date.now();
broadcast.postMessage({ type: 'TAB_CHECK', tabId });
let tabCheckCount = 0;
const tabCheckListener = (event) => {
    if (event.data.type === 'TAB_CHECK' && event.data.tabId !== tabId) {
        tabCheckCount++;
        if (tabCheckCount === 1) {
            console.warn('⚠️ WARNING: Multiple dashboard tabs detected!');
            console.warn('   This can cause overlapping audio. Please close other tabs.');
        }
    }
};
broadcast.addEventListener('message', tabCheckListener);
setTimeout(() => broadcast.removeEventListener('message', tabCheckListener), 1000);

// Visualizer Setup
let audioContext = null;
let analyser = null;
let source = null;
let currentAudio = null;
let lastPlayedSong = null;
let isVisualizerRunning = false;
let playbackRetryCount = 0;
const MAX_PLAYBACK_RETRIES = 3;

// Idle Animation State
let idleAnimationFrame = null;
let isShowingIdle = true;

// Smooth transition state for visualizer bars
const BAR_COUNT = 64;
const barCurrentHeights = new Array(BAR_COUNT).fill(0);  // Current displayed heights
const barTargetHeights = new Array(BAR_COUNT).fill(0);   // Target heights to lerp to
const LERP_SPEED = 0.15;  // How fast bars transition (0-1, higher = faster)

// Lerp helper function
function lerp(current, target, speed) {
    return current + (target - current) * speed;
}

// VIP Area State
let isVipUnlocked = false;
let vipInactivityTimer = null;
const VIP_INACTIVITY_TIMEOUT = 120000; // 2 minutes of inactivity

// Initialize VIP area based on stored unlock state
function initializeVipArea() {
    const storedUnlock = sessionStorage.getItem(VIP_UNLOCK_KEY);
    if (storedUnlock === 'true') {
        unlockVipAreaUI();
    }
}

// Handle VIP password unlock form submission
function unlockVipArea(event) {
    event.preventDefault();
    
    const passwordInput = document.getElementById('vip-password');
    const errorEl = document.getElementById('vip-password-error');
    const password = passwordInput.value;
    
    if (password === VIP_ADMIN_PASSWORD) {
        // Correct password
        sessionStorage.setItem(VIP_UNLOCK_KEY, 'true');
        unlockVipAreaUI();
        
        // Clear the password field
        passwordInput.value = '';
        errorEl.textContent = '';
    } else {
        // Incorrect password
        errorEl.textContent = 'Incorrect password. Please try again.';
        passwordInput.classList.add('shake');
        setTimeout(() => passwordInput.classList.remove('shake'), 500);
        passwordInput.value = '';
        passwordInput.focus();
    }
}

// Unlock the VIP area UI
function unlockVipAreaUI() {
    isVipUnlocked = true;
    
    const vipSection = document.getElementById('settings');
    const overlay = document.getElementById('vip-unlock-overlay');
    const contentWrapper = document.getElementById('vip-content-wrapper');
    const lockIndicator = document.getElementById('vip-lock-indicator');
    
    if (vipSection) vipSection.classList.add('unlocked');
    if (overlay) overlay.classList.add('hidden');
    if (contentWrapper) contentWrapper.classList.add('unlocked');
    if (lockIndicator) {
        lockIndicator.classList.add('unlocked');
        lockIndicator.innerHTML = '<i class="fas fa-unlock"></i><span>Unlocked</span>';
    }
    
    // Start inactivity timer
    startVipInactivityTimer();
    
    // Now fetch VIP data
    fetchPriorityUsers();
    fetchGroupMembers();
}

// Lock the VIP area (can be called to re-lock)
function lockVipArea() {
    isVipUnlocked = false;
    sessionStorage.removeItem(VIP_UNLOCK_KEY);
    
    // Clear inactivity timer
    stopVipInactivityTimer();
    
    const vipSection = document.getElementById('settings');
    const overlay = document.getElementById('vip-unlock-overlay');
    const contentWrapper = document.getElementById('vip-content-wrapper');
    const lockIndicator = document.getElementById('vip-lock-indicator');
    
    if (vipSection) vipSection.classList.remove('unlocked');
    if (overlay) overlay.classList.remove('hidden');
    if (contentWrapper) contentWrapper.classList.remove('unlocked');
    if (lockIndicator) {
        lockIndicator.classList.remove('unlocked');
        lockIndicator.innerHTML = '<i class="fas fa-lock"></i><span>Protected</span>';
    }
}

// VIP Inactivity Timer Functions
function startVipInactivityTimer() {
    stopVipInactivityTimer(); // Clear any existing timer
    
    vipInactivityTimer = setTimeout(() => {
        if (isVipUnlocked) {
            console.log('VIP area locked due to inactivity');
            lockVipArea();
            showNotification('VIP area locked due to inactivity', 'info');
        }
    }, VIP_INACTIVITY_TIMEOUT);
}

function stopVipInactivityTimer() {
    if (vipInactivityTimer) {
        clearTimeout(vipInactivityTimer);
        vipInactivityTimer = null;
    }
}

function resetVipInactivityTimer() {
    if (isVipUnlocked) {
        startVipInactivityTimer();
    }
}

// Setup VIP area activity listeners
function setupVipActivityListeners() {
    const vipSection = document.getElementById('settings');
    if (vipSection) {
        // Reset timer on any interaction within VIP section
        ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(event => {
            vipSection.addEventListener(event, resetVipInactivityTimer, { passive: true });
        });
    }
}

// Initialize VIP activity listeners after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupVipActivityListeners);
} else {
    setupVipActivityListeners();
}

// Toggle password visibility
function toggleVipPasswordVisibility() {
    const passwordInput = document.getElementById('vip-password');
    const eyeIcon = document.getElementById('vip-password-eye');
    
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

// Start audio playback with retry logic
async function startAudioPlayback() {
    if (!currentAudio) return;
    
    try {
        // CRITICAL: Resume AudioContext FIRST
        if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume();
            console.log('AudioContext resumed');
        }
        
        // Attempt to play
        await currentAudio.play();
        console.log('✓ Audio playback started successfully');
        playbackRetryCount = 0; // Reset retry counter on success
        
    } catch (e) {
        console.warn('Playback attempt failed:', e.message);
        
        // Retry logic for autoplay issues
        if (playbackRetryCount < MAX_PLAYBACK_RETRIES) {
            playbackRetryCount++;
            console.log(`Retrying playback (${playbackRetryCount}/${MAX_PLAYBACK_RETRIES})...`);
            
            // Wait a bit and retry
            setTimeout(() => {
                if (currentAudio && currentAudio.paused) {
                    startAudioPlayback();
                }
            }, 500);
        } else {
            console.error('Max playback retries reached. User interaction may be required.');
            playbackRetryCount = 0;
        }
    }
}

// Ensure audio is playing when it should be (called periodically)
function ensureAudioPlaying() {
    if (currentAudio && localCurrentSong && !localCurrentSong.isPaused && currentAudio.paused) {
        console.log('Audio should be playing but is paused, attempting to start...');
        startAudioPlayback();
    }
}

// Check audio state every 2 seconds
setInterval(ensureAudioPlaying, 2000);

// Unlock audio on first user interaction (required by browsers)
let audioUnlocked = false;
function unlockAudio() {
    if (audioUnlocked) return;
    
    // Initialize audio context if not done
    if (!audioContext) {
        initVisualizer();
    }
    
    // Resume audio context
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('AudioContext unlocked via user interaction');
            audioUnlocked = true;
            
            // Try to start playback if we should be playing
            if (currentAudio && localCurrentSong && !localCurrentSong.isPaused && currentAudio.paused) {
                startAudioPlayback();
            }
        });
    } else {
        audioUnlocked = true;
    }
}

// Listen for user interactions to unlock audio
['click', 'touchstart', 'keydown'].forEach(event => {
    document.addEventListener(event, unlockAudio, { once: false, passive: true });
});

// Try to auto-initialize AudioContext on page visibility change (helps with tab activation)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (!audioContext) {
            initVisualizer();
        } else if (audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }
        
        // If we should be playing, try to restart
        if (currentAudio && localCurrentSong && !localCurrentSong.isPaused && currentAudio.paused) {
            startAudioPlayback();
        }
    }
});

// Canvas setup (run once)
let idleCanvasCtx = null;
let idleCanvasResized = false;

// Initialize Idle Animation (can be called multiple times safely)
function initIdleAnimation() {
    const canvas = document.getElementById('visualizer-canvas');
    if (!canvas) return;
    
    // Only setup canvas context and resize handler once
    if (!idleCanvasCtx) {
        idleCanvasCtx = canvas.getContext('2d');
        
        function resizeCanvas() {
            if (canvas.parentElement) {
                canvas.width = canvas.parentElement.offsetWidth || 400;
                canvas.height = canvas.parentElement.offsetHeight || 100;
            }
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        idleCanvasResized = true;
    }
    
    // If already running an animation, don't start another
    if (idleAnimationFrame) {
        return;
    }
    
    function drawIdle() {
        if (!isShowingIdle) {
            if (idleAnimationFrame) {
                cancelAnimationFrame(idleAnimationFrame);
                idleAnimationFrame = null;
            }
            return;
        }
        
        idleAnimationFrame = requestAnimationFrame(drawIdle);
        
        const time = Date.now() / 1000;
        const barWidth = (canvas.width / BAR_COUNT) * 0.8;
        const gap = (canvas.width / BAR_COUNT) * 0.2;
        
        idleCanvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Gradient for idle bars - more subtle
        const gradient = idleCanvasCtx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(52, 211, 153, 0.6)');
        gradient.addColorStop(0.6, 'rgba(52, 211, 153, 0.3)');
        gradient.addColorStop(1, 'rgba(52, 211, 153, 0.1)');
        
        idleCanvasCtx.fillStyle = gradient;
        
        for (let i = 0; i < BAR_COUNT; i++) {
            // Smooth wave animation - calculate target height
            const wave1 = Math.sin(i * 0.15 + time * 1.5) * 0.3;
            const wave2 = Math.sin(i * 0.08 - time * 0.8) * 0.2;
            const wave3 = Math.sin(i * 0.25 + time * 2.2) * 0.15;
            const combined = (wave1 + wave2 + wave3 + 0.65) * 0.5; // Normalize to 0-0.65 range
            
            // Add slight randomness for organic feel
            const noise = Math.sin(i * 12.9898 + time) * 0.05;
            const targetHeight = Math.max(4, (combined + noise) * canvas.height * 0.5);
            
            // Set target and smoothly lerp current height
            barTargetHeights[i] = targetHeight;
            barCurrentHeights[i] = lerp(barCurrentHeights[i], barTargetHeights[i], LERP_SPEED);
            
            const x = i * (barWidth + gap) + (gap / 2);
            const y = canvas.height - barCurrentHeights[i];
            
            idleCanvasCtx.beginPath();
            idleCanvasCtx.roundRect(x, y, barWidth, barCurrentHeights[i], 4);
            idleCanvasCtx.fill();
        }
    }
    
    isShowingIdle = true;
    drawIdle();
    console.log('🎵 Idle animation started');
}

// Start idle animation as soon as DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIdleAnimation);
} else {
    // DOM already loaded
    initIdleAnimation();
}

async function initVisualizer() {
    if (audioContext) return;
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512; // Higher resolution for bars
        analyser.smoothingTimeConstant = 0.7; // More responsive (was 0.85)
        
        // Create a silent output path: analyser -> gain(0) -> destination
        // This keeps the audio graph active (so data flows) but outputs silence
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0; // Completely silent
        analyser.connect(silentGain);
        silentGain.connect(audioContext.destination);
        console.log('🔇 Created SILENT audio path (gain=0) for visualization');
        
        const canvas = document.getElementById('visualizer-canvas');
        const ctx = canvas.getContext('2d');
        
        // Data Streamer for Fullscreen Window (Independent of local draw loop)
        // This ensures the fullscreen window gets data even if this window is backgrounded/throttled
        let dataSendCount = 0;
        let debugLogCount = 0;
        setInterval(() => {
            if (!analyser || !isVisualizerRunning) {
                if (debugLogCount++ % 100 === 0) {
                    console.log('Data not sent - analyser:', !!analyser, 'isRunning:', isVisualizerRunning);
                }
                return;
            }
            
            // Send data when audio is playing OR send idle indicator
            if (currentAudio && !currentAudio.paused) {
                const bufferLength = analyser.frequencyBinCount;
                const data = new Uint8Array(bufferLength);
                analyser.getByteFrequencyData(data);
                
                broadcast.postMessage({
                    type: 'AUDIO_DATA',
                    data: Array.from(data) // Convert to regular array for reliable transmission
                });
                
                dataSendCount++;
                if (dataSendCount % 200 === 0) { // Log every 2 seconds
                    console.log('✓ Sent audio data:', dataSendCount, 'times, length:', data.length, 'sample:', data[0], data[10], data[50]);
                }
            } else if (localCurrentSong && !localCurrentSong.streamUrl) {
                // Song is preparing, send idle animation indicator
                broadcast.postMessage({ type: 'IDLE_ANIMATION', preparing: true });
            } else {
                if (debugLogCount++ % 100 === 0) {
                    console.log('Data not sent - currentAudio:', !!currentAudio, 'paused:', currentAudio?.paused);
                }
            }
        }, 10); // ~100 FPS for smoother data stream

        // Modern Minimalist Visualizer
        function draw() {
            if (!isVisualizerRunning) return;
            requestAnimationFrame(draw);
            
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            // Handle no audio or paused state - show idle animation
            const shouldShowAudio = currentAudio && !currentAudio.paused;
            
            if (!shouldShowAudio) {
                // When audio isn't playing, let idle animation handle it
                if (!isShowingIdle) {
                    isShowingIdle = true;
                    initIdleAnimation();
                }
                return;
            }
            
            // Real audio is playing - stop idle animation
            if (isShowingIdle) {
                isShowingIdle = false;
                if (idleAnimationFrame) {
                    cancelAnimationFrame(idleAnimationFrame);
                    idleAnimationFrame = null;
                }
            }

            analyser.getByteFrequencyData(dataArray);
            
            // Send audio data to fullscreen player on EVERY frame we draw locally
            // This ensures the player gets data at the same rate as our local visualization
            // (even when throttled by the browser for background tabs)
            broadcast.postMessage({
                type: 'AUDIO_DATA',
                data: Array.from(dataArray)
            });
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Configuration for cleaner look
            const usefulBins = Math.floor(bufferLength * 0.8); // Use 80% of range
            const barWidth = (canvas.width / BAR_COUNT) * 0.8; // 80% width, 20% gap
            const gap = (canvas.width / BAR_COUNT) * 0.2;
            const step = Math.floor(usefulBins / BAR_COUNT);

            // Gradient for bars
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, 'rgba(52, 211, 153, 0.95)'); // Primary emerald
            gradient.addColorStop(0.6, 'rgba(52, 211, 153, 0.5)');
            gradient.addColorStop(1, 'rgba(52, 211, 153, 0.15)'); // Fade out

            ctx.fillStyle = gradient;

            for (let i = 0; i < BAR_COUNT; i++) {
                // Average out the values for this bar to make it smoother
                let sum = 0;
                for (let j = 0; j < step; j++) {
                    sum += dataArray[(i * step) + j] || 0;
                }
                const value = sum / step;
                
                // Logarithmic scaling for height to make quiet sounds visible
                const percent = value / 255;
                const targetHeight = Math.pow(percent, 0.8) * (canvas.height * 0.8); // Max 80% height
                
                // Set target and smoothly lerp current height for seamless transitions
                barTargetHeights[i] = targetHeight;
                barCurrentHeights[i] = lerp(barCurrentHeights[i], barTargetHeights[i], LERP_SPEED);
                
                // Rounded bars
                const x = i * (barWidth + gap) + (gap / 2); // Center bars
                const y = canvas.height - barCurrentHeights[i];
                
                if (barCurrentHeights[i] > 2) {
                    ctx.beginPath();
                    ctx.roundRect(x, y, barWidth, barCurrentHeights[i], 4); // 4px border radius
                    ctx.fill();
                }
            }
        }
        
        function resizeCanvas() {
            canvas.width = canvas.parentElement.offsetWidth;
            canvas.height = canvas.parentElement.offsetHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        
        isVisualizerRunning = true;
        draw();
    } catch (e) {
        console.error('Web Audio API not supported', e);
    }
}

// User interaction to unlock AudioContext (required by browsers for actual audio)
// But we can show idle animation without user interaction
document.body.addEventListener('click', () => {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    } else if (!audioContext) {
        initVisualizer();
    }
}, { once: false, passive: true });

async function fetchData() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        updateAuthUI(data.auth);
        updateQueueUI(data.queue);
        updateStatsUI(data.stats);
    } catch (error) {
        console.error('Error fetching status:', error);
    }
}

// Format time from milliseconds to MM:SS
function formatTime(ms) {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Format uptime
function formatUptime(ms) {
    if (!ms || ms < 0) return '0h 0m';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

function updateAuthUI(authData) {
    const authSection = document.getElementById('auth-section');
    const qrContainer = document.getElementById('qr-container');
    const statusBadge = document.getElementById('connection-status');
    
    if (authData.isConnected) {
        statusBadge.className = 'status-badge online';
        statusBadge.innerHTML = '<span class="dot"></span> SYSTEM ONLINE';
        authSection.classList.add('hidden');
    } else {
        statusBadge.className = 'status-badge offline';
        statusBadge.innerHTML = '<span class="dot"></span> SYSTEM OFFLINE';
        authSection.classList.remove('hidden');
    }

    if (!authData.isConnected && authData.qr) {
        qrContainer.innerHTML = ''; 
        new QRCode(qrContainer, {
            text: authData.qr,
            width: 256,
            height: 256,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    } else if (!authData.isConnected && !authData.qr) {
        qrContainer.innerHTML = '<div class="qr-placeholder"><i class="fas fa-circle-notch fa-spin"></i> Generating QR...</div>';
    }
}

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

async function fetchPriorityUsers() {
    try {
        const response = await fetch('/api/priority');
        const users = await response.json();
        const list = document.getElementById('vip-list');
        const countBadge = document.getElementById('vip-count-badge');
        list.innerHTML = '';
        
        // Update count badge
        if (countBadge) {
            countBadge.textContent = users.length;
        }
        
        // Fetch profile pictures for all users in parallel
        const usersWithPictures = await Promise.all(users.map(async (user) => {
            // Handle both old format (string) and new format (object with id and name)
            const userId = typeof user === 'string' ? user : user.id;
            const userName = typeof user === 'object' ? user.name : null;
            
            // Fetch profile picture
            let profilePicUrl = null;
            try {
                const picResponse = await fetch(`/api/priority/profile-picture/${encodeURIComponent(userId)}`);
                const picData = await picResponse.json();
                profilePicUrl = picData.url;
            } catch (error) {
                console.error('Error fetching profile picture for', userId, error);
            }
            
            return { userId, userName, profilePicUrl };
        }));
        
        // Create VIP cards with new design
        usersWithPictures.forEach(({ userId, userName, profilePicUrl }) => {
            const card = document.createElement('li');
            card.className = 'vip-user-card';
            
            // Create avatar element
            const avatarHtml = profilePicUrl 
                ? `<img src="${profilePicUrl}" alt="${userName || 'VIP'}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>';">`
                : '<i class="fas fa-user"></i>';
            
            // Create display text
            const displayName = userName || 'VIP User';
            const displayId = userId.length > 20 ? userId.substring(0, 20) + '...' : userId;
            
            card.innerHTML = `
                <div class="vip-user-avatar">
                    ${avatarHtml}
                </div>
                <div class="vip-user-info">
                    <div class="vip-user-name">${displayName}</div>
                    <div class="vip-user-id">${displayId}</div>
                </div>
                <button class="vip-user-remove" onclick="removeVip('${userId}')" title="Remove VIP">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            list.appendChild(card);
        });
        
        // Show empty state if no VIPs
        if (usersWithPictures.length === 0) {
            list.innerHTML = `
                <div class="vip-empty-state">
                    <i class="fas fa-crown"></i>
                    <p>No VIP users yet</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error fetching priority users:', error);
    }
}

async function addVip(e) {
    e.preventDefault();
    const input = document.getElementById('vip-id');
    const id = input.value;
    
    if(!id) return;

    try {
        await fetch('/api/priority/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        input.value = '';
        fetchPriorityUsers();
        showNotification('VIP ADDED', 'success');
    } catch (error) {
        showNotification('ERROR ADDING VIP', 'error');
    }
}

// Add VIP from group member selection
async function addVipFromMember(userId, userName) {
    try {
        await fetch('/api/priority/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: userId, name: userName })
        });
        fetchPriorityUsers();
        fetchGroupMembers(); // Refresh to update the checkmarks
        showNotification(`${userName || 'User'} added as VIP`, 'success');
    } catch (error) {
        showNotification('ERROR ADDING VIP', 'error');
    }
}

window.removeVip = async function(id) {
    const displayId = id.length > 20 ? id.substring(0, 20) + '...' : id;
    showConfirmationModal({
        title: 'Remove VIP',
        message: `Are you sure you want to remove ${displayId} from VIP?`,
        icon: 'fa-user-times',
        onConfirm: async () => {
            try {
                await fetch('/api/priority/remove', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                fetchPriorityUsers();
                fetchGroupMembers(); // Refresh to update the checkmarks
                showNotification('VIP REMOVED', 'success');
            } catch (error) {
                showNotification('ERROR REMOVING VIP', 'error');
            }
        }
    });
};

// Store group members data globally for filtering
let allGroupMembers = [];
let currentVipIds = [];

// Fetch group members
async function fetchGroupMembers() {
    try {
        const response = await fetch('/api/priority/group-members');
        const data = await response.json();
        
        if (data.error) {
            const membersList = document.getElementById('members-list');
            membersList.innerHTML = `
                <div class="vip-empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>${data.message || data.error}</p>
                </div>
            `;
            return;
        }
        
        allGroupMembers = data.participants || [];
        
        // Get current VIP IDs
        const vipResponse = await fetch('/api/priority');
        const vipUsers = await vipResponse.json();
        currentVipIds = vipUsers.map(u => typeof u === 'string' ? u : u.id);
        
        displayMembers(allGroupMembers);
    } catch (error) {
        console.error('Error fetching group members:', error);
        const membersList = document.getElementById('members-list');
        membersList.innerHTML = `
            <div class="vip-empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load members</p>
            </div>
        `;
    }
}

// Display members in the list
function displayMembers(members) {
    const membersList = document.getElementById('members-list');
    
    if (members.length === 0) {
        membersList.innerHTML = `
            <div class="vip-empty-state">
                <i class="fas fa-users-slash"></i>
                <p>No members found</p>
            </div>
        `;
        return;
    }
    
    membersList.innerHTML = '';
    
    members.forEach(member => {
        const isVip = currentVipIds.includes(member.id);
        const memberCard = document.createElement('div');
        memberCard.className = `vip-member-item ${isVip ? 'is-vip' : ''}`;
        
        const avatarHtml = member.profilePicUrl 
            ? `<img src="${member.profilePicUrl}" alt="${member.name || 'Member'}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>';">`
            : '<i class="fas fa-user"></i>';
        
        const displayName = member.name || 'Unknown User';
        const escapedName = displayName.replace(/'/g, "\\'");
        
        memberCard.innerHTML = `
            <div class="vip-member-avatar">
                ${avatarHtml}
            </div>
            <div class="vip-member-info">
                <div class="vip-member-name">${displayName}</div>
            </div>
            <button class="vip-member-add-btn ${isVip ? 'added' : ''}" 
                    onclick="addVipFromMember('${member.id}', '${escapedName}')"
                    ${isVip ? 'disabled' : ''}
                    title="${isVip ? 'Already VIP' : 'Add as VIP'}">
                <i class="fas ${isVip ? 'fa-check' : 'fa-plus'}"></i>
            </button>
        `;
        
        membersList.appendChild(memberCard);
    });
}

// Filter members based on search input
function filterMembers() {
    const searchTerm = document.getElementById('member-search').value.toLowerCase();
    
    if (!searchTerm) {
        displayMembers(allGroupMembers);
        return;
    }
    
    const filtered = allGroupMembers.filter(member => {
        const nameMatch = member.name && member.name.toLowerCase().includes(searchTerm);
        const idMatch = member.id.toLowerCase().includes(searchTerm);
        return nameMatch || idMatch;
    });
    
    displayMembers(filtered);
}

// Toggle between group selector and manual input
function showGroupSelector() {
    document.getElementById('group-selector-container').classList.remove('hidden');
    document.getElementById('add-vip-form').classList.add('hidden');
    document.getElementById('toggle-group-select').classList.add('active');
    document.getElementById('toggle-manual-input').classList.remove('active');
}

function showManualInput() {
    document.getElementById('group-selector-container').classList.add('hidden');
    document.getElementById('add-vip-form').classList.remove('hidden');
    document.getElementById('toggle-group-select').classList.remove('active');
    document.getElementById('toggle-manual-input').classList.add('active');
}

// Make functions globally available
window.filterMembers = filterMembers;
window.showGroupSelector = showGroupSelector;
window.showManualInput = showManualInput;
window.addVipFromMember = addVipFromMember;

async function addSong(e) {
    e.preventDefault();
    const urlInput = document.getElementById('song-url');
    const requesterInput = document.getElementById('requester-name');
    const btn = e.target.querySelector('button');
    
    const url = urlInput.value;
    const requester = requesterInput.value;

    const originalBtnContent = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-compact-disc fa-spin"></i> Adding...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/queue/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, requester })
        });
        
        if (response.ok) {
            const data = await response.json();
            urlInput.value = '';
            showNotification(`ADDED: ${data.title || 'TRACK'}`, 'success');
            fetchData();
            // Close the modal after successful add
            closeAddTrackModal();
        } else {
            showNotification('FAILED TO ADD', 'error');
        }
    } catch (error) {
        console.error('Error adding song:', error);
        showNotification('CONNECTION ERROR', 'error');
    } finally {
        btn.innerHTML = originalBtnContent;
        btn.disabled = false;
    }
}

// Store skip confirmation setting
let skipConfirmationEnabled = true;
let showRequesterNameEnabled = true;

async function skipSong() {
    // Check if confirmation is enabled
    const confirmSkipSetting = document.getElementById('setting-confirmSkip');
    const shouldConfirm = confirmSkipSetting ? confirmSkipSetting.checked : skipConfirmationEnabled;
    
    if (shouldConfirm) {
        showConfirmationModal({
            title: 'Skip Track',
            message: 'Are you sure you want to skip the current track?',
            icon: 'fa-forward',
            onConfirm: async () => {
                await performSkip();
            }
        });
    } else {
        // Skip directly without confirmation
        await performSkip();
    }
}

async function performSkip() {
    try {
        await fetch('/api/queue/skip', { method: 'POST' });
        showNotification('TRACK SKIPPED', 'success');
        fetchData();
    } catch (error) {
        showNotification('SKIP FAILED', 'error');
    }
}

async function togglePause() {
    const btn = document.getElementById('play-pause-btn');
    
    // Don't allow toggling if button is disabled (no song)
    if (btn.disabled) {
        return;
    }
    
    const isCurrentlyPaused = btn.getAttribute('data-paused') === 'true';
    const endpoint = isCurrentlyPaused ? '/api/queue/resume' : '/api/queue/pause';
    
    try {
        const res = await fetch(endpoint, { method: 'POST' });
        if (res.ok) {
            showNotification(isCurrentlyPaused ? 'RESUMED' : 'PAUSED', 'success');
            fetchData();
        } else {
            showNotification('ACTION FAILED', 'error');
        }
    } catch (error) {
        showNotification('CONNECTION ERROR', 'error');
    }
}

window.removeSong = async function(index) {
    showConfirmationModal({
        title: 'Remove Track',
        message: 'Are you sure you want to remove this track from the queue?',
        icon: 'fa-times',
        onConfirm: async () => {
            try {
                await fetch(`/api/queue/remove/${index}`, { method: 'POST' });
                showNotification('TRACK REMOVED', 'success');
                fetchData();
            } catch (error) {
                showNotification('REMOVAL FAILED', 'error');
            }
        }
    });
};

function showNotification(message, type = 'info') {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.bottom = '30px';
    div.style.right = '30px';
    
    // Color scheme based on type
    const colors = {
        success: { bg: '#86E7B8', text: '#2c3e50', icon: 'fa-check' },
        error: { bg: '#ffcdd2', text: '#c62828', icon: 'fa-exclamation' },
        info: { bg: '#a78bfa', text: '#1a1a2e', icon: 'fa-info-circle' }
    };
    const colorScheme = colors[type] || colors.info;
    
    div.style.background = colorScheme.bg;
    div.style.color = colorScheme.text;
    div.style.padding = '15px 25px';
    div.style.fontFamily = '"Inter", sans-serif';
    div.style.fontWeight = '600';
    div.style.zIndex = '2000';
    div.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)';
    div.style.borderRadius = '12px';
    div.style.transform = 'translateY(100px)';
    div.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    
    div.innerHTML = `<i class="fas ${colorScheme.icon}"></i> ${message}`;
    
    document.body.appendChild(div);
    
    requestAnimationFrame(() => {
        div.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        div.style.transform = 'translateY(100px)';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

// Background Image Management
let currentBackgroundUrl = null;

function updateBackgroundImage(thumbnailUrl) {
    if (currentBackgroundUrl === thumbnailUrl) return; // Already set
    
    currentBackgroundUrl = thumbnailUrl;
    const bgOverlay = document.querySelector('.bg-overlay');
    
    if (bgOverlay) {
        // Create a new image to preload
        const img = new Image();
        img.onload = () => {
            // Smooth transition
            bgOverlay.style.transition = 'opacity 0.5s ease-in-out';
            bgOverlay.style.opacity = '0';
            setTimeout(() => {
                bgOverlay.style.backgroundImage = `url('${thumbnailUrl}')`;
                bgOverlay.style.backgroundColor = 'transparent';
                setTimeout(() => {
                    bgOverlay.style.opacity = '1';
                }, 50);
            }, 300);
        };
        img.onerror = () => {
            console.error('Failed to load thumbnail:', thumbnailUrl);
        };
        img.src = thumbnailUrl;
    }
}

function clearBackgroundImage() {
    currentBackgroundUrl = null;
    const bgOverlay = document.querySelector('.bg-overlay');
    
    if (bgOverlay) {
        bgOverlay.style.transition = 'opacity 0.5s ease-in-out';
        bgOverlay.style.opacity = '0';
        setTimeout(() => {
            bgOverlay.style.backgroundImage = 'none';
            bgOverlay.style.backgroundColor = 'transparent';
        }, 500);
    }
}

// Fullscreen Logic
let fullscreenWindow = null;

function openFullscreenWindow() {
    if (fullscreenWindow && !fullscreenWindow.closed) {
        fullscreenWindow.focus();
        return;
    }

    const width = 1024;
    const height = 768;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    fullscreenWindow = window.open('pages/player.html', 'WabiSabyNowPlaying', `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`);
    
    // Sync initial state after a short delay to allow load
    setTimeout(() => {
        updateFullscreenWindow(localCurrentSong || null);
    }, 500);
}


function updateFullscreenProgress(current, total, progressPercent) {
    // Include audio data with progress update as a fallback
    // This ensures player gets audio data at least once per second even if draw loop is throttled
    let audioData = null;
    if (analyser && currentAudio && !currentAudio.paused) {
        const bufferLength = analyser.frequencyBinCount;
        const data = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(data);
        audioData = Array.from(data);
    }
    
    broadcast.postMessage({
        type: 'PROGRESS_UPDATE',
        current,
        total,
        progress: progressPercent,
        audioData: audioData  // Fallback audio data
    });
}

// Store current song data for fullscreen player seeking
function updateFullscreenWindow(song) {
    // Store song data for seeking
    if (song) {
        broadcast.postMessage({
            type: 'SONG_DATA',
            song: {
                duration: song.duration,
                current: song.elapsed || 0
            }
        });
    }
    
    // Use BroadcastChannel for reliable updates
    broadcast.postMessage({
        type: 'SONG_UPDATE',
        song: song
    });
}

// Drag and Drop State
let draggedElement = null;
let draggedIndex = null;

function handleDragStart(e) {
    draggedElement = this;
    draggedIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    // Remove all drag-over indicators
    document.querySelectorAll('.queue-item').forEach(item => {
        item.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    if (this !== draggedElement) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

async function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    this.classList.remove('drag-over');
    
    if (draggedElement !== this) {
        const dropIndex = parseInt(this.dataset.index);
        
        // Send reorder request to server
        try {
            const response = await fetch('/api/queue/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    fromIndex: draggedIndex, 
                    toIndex: dropIndex 
                })
            });
            
            if (response.ok) {
                showNotification('Queue reordered', 'success');
                fetchData(); // Refresh the queue display
            } else {
                showNotification('Failed to reorder', 'error');
            }
        } catch (error) {
            console.error('Error reordering queue:', error);
            showNotification('Reorder failed', 'error');
        }
    }
    
    return false;
}

async function startNewSession() {
    showConfirmationModal({
        title: 'Start New Session', 
        message: 'Are you sure? This will stop the current song, clear the entire queue, and reset all session statistics.',
        icon: 'fa-redo',
        onConfirm: async () => {
            try {
                const response = await fetch('/api/queue/newsession', {
                    method: 'POST'
                });
                
                if (response.ok) {
                    showNotification('New session started', 'success');
                    fetchData();
                    // Close settings modal if open
                    closeSettingsModal();
                } else {
                    showNotification('Failed to start new session', 'error');
                }
            } catch (error) {
                console.error('Error starting new session:', error);
                showNotification('Error starting new session', 'error');
            }
        }
    });
}

async function prefetchAll() {
    const btn = document.getElementById('prefetch-btn');
    
    // Don't allow prefetching if button is disabled (queue is empty)
    if (btn.disabled || btn.classList.contains('disabled')) {
        return;
    }
    
    const originalContent = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> DOWNLOADING...';
    btn.disabled = true;
    
    try {
        const response = await fetch('/api/queue/prefetch', { method: 'POST' });
        if (response.ok) {
            showNotification('PREFETCH STARTED', 'success');
        } else {
            showNotification('PREFETCH FAILED', 'error');
        }
    } catch (error) {
        console.error('Error starting prefetch:', error);
        showNotification('CONNECTION ERROR', 'error');
    } finally {
        setTimeout(() => {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }, 2000);
    }
}

// ========================================
// Enhanced Statistics (Backend-Persisted)
// ========================================

// Tab switching
document.querySelectorAll('.stats-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        // Update buttons
        document.querySelectorAll('.stats-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update content
        document.querySelectorAll('.stats-tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        
        // Load data for this tab
        if (tab === 'overview') {
            fetchOverviewView();
        } else if (tab === 'requesters') {
            fetchRequestersView();
        } else if (tab === 'history') {
            fetchHistoryView();
        }
    });
});

// Fetch and display overview from backend
async function fetchOverviewView() {
    const container = document.querySelector('.stats-overview');
    
    try {
        const res = await fetch('/api/stats/overview');
        if (!res.ok) throw new Error('Failed to fetch');
        
        const data = await res.json();
        
        // Format duration
        const formatDuration = (ms) => {
            if (!ms) return '0m';
            const hours = Math.floor(ms / 3600000);
            const mins = Math.floor((ms % 3600000) / 60000);
            if (hours > 0) return `${hours}h ${mins}m`;
            return `${mins}m`;
        };
        
        // Format peak hour
        const formatHour = (hour) => {
            if (hour === null) return '-';
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const h = hour % 12 || 12;
            return `${h}${ampm}`;
        };
        
        // Build hourly chart (simple bar visualization)
        let hourlyChart = '';
        if (data.hourlyDistribution && Object.keys(data.hourlyDistribution).length > 0) {
            const maxCount = Math.max(...Object.values(data.hourlyDistribution), 1);
            hourlyChart = `
                <div class="overview-section">
                    <h4><i class="fas fa-clock"></i> Activity by Hour</h4>
                    <div class="hourly-chart">
                        ${Array.from({length: 24}, (_, i) => {
                            const count = data.hourlyDistribution[i] || 0;
                            const height = Math.max((count / maxCount) * 100, 4);
                            const isActive = count > 0;
                            return `<div class="hour-bar ${isActive ? 'active' : ''}" style="height: ${height}%" title="${i}:00 - ${count} songs"></div>`;
                        }).join('')}
                    </div>
                    <div class="hour-labels">
                        <span>12AM</span><span>6AM</span><span>12PM</span><span>6PM</span><span>11PM</span>
                    </div>
                </div>
            `;
        }
        
        // Build top artists section
        let artistsSection = '';
        if (data.topArtists && data.topArtists.length > 0) {
            artistsSection = `
                <div class="overview-section">
                    <h4><i class="fas fa-microphone-alt"></i> Top Artists</h4>
                    <div class="overview-list">
                        ${data.topArtists.map(({name, count}, i) => `
                            <div class="overview-list-item">
                                <span class="overview-rank">${i + 1}</span>
                                <span class="overview-name">${name}</span>
                                <span class="overview-count">${count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div class="overview-grid">
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-play-circle"></i></div>
                    <div class="overview-stat-value">${data.songsPlayed || 0}</div>
                    <div class="overview-stat-label">Total Songs</div>
                </div>
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-hourglass-half"></i></div>
                    <div class="overview-stat-value">${data.totalDuration > 0 ? formatDuration(data.totalDuration) : '-'}</div>
                    <div class="overview-stat-label">Total Playtime</div>
                </div>
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-users"></i></div>
                    <div class="overview-stat-value">${data.uniqueRequesters || 0}</div>
                    <div class="overview-stat-label">Unique DJs</div>
                </div>
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-star"></i></div>
                    <div class="overview-stat-value">${data.uniqueArtists || 0}</div>
                    <div class="overview-stat-label">Artists Played</div>
                </div>
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-clock"></i></div>
                    <div class="overview-stat-value">${data.avgDuration > 0 ? formatDuration(data.avgDuration) : '-'}</div>
                    <div class="overview-stat-label">Avg Song</div>
                </div>
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-fire"></i></div>
                    <div class="overview-stat-value">${formatHour(data.peakHour)}</div>
                    <div class="overview-stat-label">Peak Hour</div>
                </div>
            </div>
            ${hourlyChart}
            ${artistsSection}
        `;
    } catch (e) {
        container.innerHTML = '<p class="stats-placeholder">Failed to load overview</p>';
    }
}

// Load overview on initial page load
fetchOverviewView();

// Fetch and display top requesters from backend
async function fetchRequestersView() {
    const container = document.querySelector('.requesters-list');
    
    try {
        const res = await fetch('/api/stats/requesters?limit=20');
        if (!res.ok) throw new Error('Failed to fetch');
        
        const requesters = await res.json();
        
        if (requesters.length === 0) {
            container.innerHTML = '<p class="stats-placeholder">No requests yet</p>';
            return;
        }
        
        container.innerHTML = requesters.map(({ rank, name, count }) => {
            const rankClass = rank <= 3 ? `top-${rank}` : '';
            const rankIcon = rank === 1 ? '👑' : rank;
            
            return `
                <div class="requester-item">
                    <div class="requester-info">
                        <div class="requester-rank ${rankClass}">${rankIcon}</div>
                        <div class="requester-details">
                            <div class="requester-name">${name}</div>
                            <div class="requester-subtitle">Rank #${rank}</div>
                        </div>
                    </div>
                    <div class="requester-count">
                        <i class="fas fa-music"></i>
                        ${count} ${count === 1 ? 'song' : 'songs'}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = '<p class="stats-placeholder">Failed to load requesters</p>';
    }
}

// Fetch and display history from backend
async function fetchHistoryView() {
    const container = document.querySelector('.history-list');
    
    try {
        const res = await fetch('/api/stats/history?limit=20');
        if (!res.ok) throw new Error('Failed to fetch');
        
        const history = await res.json();
        
        if (history.length === 0) {
            container.innerHTML = '<p class="stats-placeholder">No songs played yet</p>';
            return;
        }
        
        container.innerHTML = history.map(song => {
            const timeAgo = getTimeAgo(song.playedAt);
            return `
                <div class="history-item">
                    ${song.thumbnailUrl ? `
                        <div class="history-thumbnail">
                            <img src="${song.thumbnailUrl}" alt="Thumbnail">
                        </div>
                    ` : ''}
                    <div class="history-details">
                        <div class="history-title">${song.title}</div>
                        <div class="history-meta">
                            <span><i class="fas fa-user"></i> ${song.requester}</span>
                        </div>
                    </div>
                    <div class="history-time">${timeAgo}</div>
                </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = '<p class="stats-placeholder">Failed to load history</p>';
    }
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// Fetch detailed stats periodically
async function fetchDetailedStats() {
    try {
        const res = await fetch('/api/stats');
        if (!res.ok) return;
        
        const stats = await res.json();
        
        // Update songs played counter from backend stats
        const songsPlayedEl = document.getElementById('songs-played-value');
        if (songsPlayedEl) {
            songsPlayedEl.textContent = stats.songsPlayed || 0;
        }
        
        // Update uptime from backend stats
        const uptimeEl = document.getElementById('uptime-value');
        if (uptimeEl && stats.uptime) {
            uptimeEl.textContent = formatUptime(stats.uptime);
        }
        
        // Refresh active tab data if visible
        const activeTab = document.querySelector('.stats-tab-btn.active');
        if (activeTab) {
            const tab = activeTab.dataset.tab;
            if (tab === 'requesters') {
                fetchRequestersView();
            } else if (tab === 'history') {
                fetchHistoryView();
            }
        }
    } catch (e) {
        // Silent fail
    }
}

// Fetch detailed stats every 10 seconds (less frequent, backend handles persistence)
setInterval(fetchDetailedStats, 10000);
fetchDetailedStats(); // Initial fetch

// Analytics Collapse Toggle
function toggleStatsCollapse() {
    const statsSection = document.getElementById('stats');
    const collapseBtn = document.getElementById('stats-collapse-btn');
    
    if (statsSection.classList.contains('collapsed')) {
        statsSection.classList.remove('collapsed');
        collapseBtn.setAttribute('title', 'Collapse Analytics');
    } else {
        statsSection.classList.add('collapsed');
        collapseBtn.setAttribute('title', 'Expand Analytics');
    }
}

// ========================================
// Configuration Settings Panel V2
// ========================================

const qualityValues = ['64k', '128k', '192k', '256k', '320k'];
let settingsSaveTimeout = null;

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to fetch settings');
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        const { settings } = data;
        
        // Populate download settings
        document.getElementById('setting-audioFormat').value = settings.download.audioFormat;
        document.getElementById('setting-audioQuality').value = settings.download.audioQuality;
        document.getElementById('setting-playerClient').value = settings.download.playerClient;
        document.getElementById('setting-downloadThumbnails').checked = settings.download.downloadThumbnails;
        
        // Sync quality slider
        syncQualitySlider(settings.download.audioQuality);
        
        // Sync client selector
        syncClientSelector(settings.download.playerClient);
        
        // Populate playback settings
        document.getElementById('setting-cleanupAfterPlay').checked = settings.playback.cleanupAfterPlay;
        const confirmSkipEl = document.getElementById('setting-confirmSkip');
        if (confirmSkipEl) {
            confirmSkipEl.checked = settings.playback.confirmSkip;
            skipConfirmationEnabled = settings.playback.confirmSkip;
        }
        const showRequesterNameEl = document.getElementById('setting-showRequesterName');
        if (showRequesterNameEl) {
            showRequesterNameEl.checked = settings.playback.showRequesterName;
            showRequesterNameEnabled = settings.playback.showRequesterName;
        }
        document.getElementById('setting-songTransitionDelay').value = settings.playback.songTransitionDelay;
        
        // Populate performance settings
        document.getElementById('setting-prefetchNext').checked = settings.performance.prefetchNext;
        document.getElementById('setting-prefetchCount').value = settings.performance.prefetchCount;
        
        // Populate notification settings
        document.getElementById('setting-notificationsEnabled').checked = settings.notifications.enabled;
        document.getElementById('setting-notifyAtPosition').value = settings.notifications.notifyAtPosition;
        
    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

function syncQualitySlider(quality) {
    const slider = document.getElementById('setting-audioQuality-slider');
    const labels = document.querySelectorAll('.quality-labels span');
    if (!slider) return;
    
    const index = qualityValues.indexOf(quality);
    if (index !== -1) {
        slider.value = index;
        labels.forEach((label, i) => {
            label.classList.toggle('active', i === index);
        });
    }
}

function syncClientSelector(client) {
    const radios = document.querySelectorAll('input[name="playerClient"]');
    radios.forEach(radio => {
        radio.checked = radio.value === client;
    });
}

async function updateSetting(category, key, value) {
    const settingRow = document.querySelector(`[data-category="${category}"][data-key="${key}"]`)?.closest('.setting-row');
    
    if (settingRow) {
        settingRow.classList.add('saving');
        settingRow.classList.remove('saved');
    }
    
    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, key, value })
        });
        
        const data = await res.json();
        
        if (!data.success) {
            throw new Error(data.error);
        }
        
        // Update local state for skip confirmation
        if (category === 'playback' && key === 'confirmSkip') {
            skipConfirmationEnabled = value;
        }
        
        // Update local state for show requester name
        if (category === 'playback' && key === 'showRequesterName') {
            showRequesterNameEnabled = value;
            // Refresh current song display to apply change immediately
            if (localCurrentSong) {
                updateQueueUI({ queue: [], currentSong: localCurrentSong });
            }
            // Broadcast settings update to player view
            broadcast.postMessage({
                type: 'SETTINGS_UPDATE',
                settings: { playback: { showRequesterName: value } }
            });
        }
        
        if (settingRow) {
            settingRow.classList.remove('saving');
            settingRow.classList.add('saved');
            setTimeout(() => settingRow.classList.remove('saved'), 1500);
        }
        
        // Show save indicator
        showSaveIndicator();
        
        console.log(`Setting updated: ${category}.${key} = ${value}`);
        
    } catch (err) {
        console.error('Failed to update setting:', err);
        if (settingRow) {
            settingRow.classList.remove('saving');
        }
        // Reload settings to revert to actual values
        loadSettings();
    }
}

function showSaveIndicator() {
    const indicator = document.getElementById('settings-save-indicator');
    if (!indicator) return;
    
    indicator.classList.add('visible');
    
    clearTimeout(settingsSaveTimeout);
    settingsSaveTimeout = setTimeout(() => {
        indicator.classList.remove('visible');
    }, 2000);
}

function initSettingsListeners() {
    // Navigation between panels
    document.querySelectorAll('.settings-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const category = item.dataset.category;
            switchSettingsPanel(category);
        });
    });
    
    // Handle all select changes in settings modal
    document.querySelectorAll('#settings-modal select').forEach(select => {
        select.addEventListener('change', (e) => {
            const category = e.target.dataset.category;
            const key = e.target.dataset.key;
            if (category && key) {
                updateSetting(category, key, e.target.value);
            }
        });
    });
    
    // Handle all checkbox changes (toggle switches)
    document.querySelectorAll('#settings-modal input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const category = e.target.dataset.category;
            const key = e.target.dataset.key;
            if (category && key) {
                updateSetting(category, key, e.target.checked);
            }
        });
    });
    
    // Handle all number inputs with debounce
    document.querySelectorAll('#settings-modal input[type="number"]').forEach(input => {
        let debounceTimer;
        input.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const category = e.target.dataset.category;
                const key = e.target.dataset.key;
                const value = parseInt(e.target.value, 10);
                if (category && key && !isNaN(value)) {
                    updateSetting(category, key, value);
                }
            }, 500);
        });
    });
    
    // Quality slider
    const qualitySlider = document.getElementById('setting-audioQuality-slider');
    if (qualitySlider) {
        qualitySlider.addEventListener('input', (e) => {
            const value = qualityValues[parseInt(e.target.value)];
            document.getElementById('setting-audioQuality').value = value;
            syncQualitySlider(value);
            updateSetting('download', 'audioQuality', value);
        });
    }
    
    // Client selector radios
    document.querySelectorAll('input[name="playerClient"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.getElementById('setting-playerClient').value = e.target.value;
                updateSetting('download', 'playerClient', e.target.value);
            }
        });
    });
    
    // Number input +/- buttons
    document.querySelectorAll('.number-input-wrapper').forEach(wrapper => {
        const input = wrapper.querySelector('input[type="number"]');
        const minusBtn = wrapper.querySelector('.number-btn.minus');
        const plusBtn = wrapper.querySelector('.number-btn.plus');
        
        if (input && minusBtn && plusBtn) {
            const step = parseInt(input.step) || 1;
            const min = parseInt(input.min) || 0;
            const max = parseInt(input.max) || 100;
            
            minusBtn.addEventListener('click', () => {
                const current = parseInt(input.value) || 0;
                const newValue = Math.max(min, current - step);
                input.value = newValue;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            
            plusBtn.addEventListener('click', () => {
                const current = parseInt(input.value) || 0;
                const newValue = Math.min(max, current + step);
                input.value = newValue;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
    });
    
    // Search functionality
    initSettingsSearch();
    
    // Reset button
    const resetBtn = document.getElementById('settings-reset-all');
    if (resetBtn) {
        resetBtn.addEventListener('click', handleSettingsReset);
    }
    
    // Groups management
    const addGroupForm = document.getElementById('add-group-form');
    if (addGroupForm) {
        addGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('group-id-input');
            const groupId = input.value.trim();
            if (groupId) {
                await addGroup(groupId);
                input.value = '';
            }
        });
    }
    
    // Settings modal open/close listeners
    document.getElementById('settings-btn').addEventListener('click', openSettingsModal);
    document.getElementById('settings-modal-close').addEventListener('click', closeSettingsModal);
    
    // Close modal when clicking on overlay background
    document.getElementById('settings-modal').addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') {
            closeSettingsModal();
        }
    });
    
    // Close modals on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSettingsModal();
            closeAddTrackModal();
            closeConfirmationModal();
        }
    });
}

function switchSettingsPanel(category) {
    // Update nav
    document.querySelectorAll('.settings-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.category === category);
    });
    
    // Update panels
    document.querySelectorAll('.settings-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === category);
    });
    
    // Load groups when switching to groups panel
    if (category === 'groups') {
        loadGroups();
    }
    
    // Clear search when switching panels
    const searchInput = document.getElementById('settings-search');
    if (searchInput && searchInput.value) {
        searchInput.value = '';
        document.getElementById('settings-search-clear').classList.add('hidden');
    }
}

function initSettingsSearch() {
    const searchInput = document.getElementById('settings-search');
    const clearBtn = document.getElementById('settings-search-clear');
    
    if (!searchInput) return;
    
    let searchDebounce;
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        
        // Show/hide clear button
        clearBtn.classList.toggle('hidden', !query);
        
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            if (query.length >= 2) {
                performSettingsSearch(query);
            } else if (query.length === 0) {
                exitSearchMode();
            }
        }, 200);
    });
    
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.classList.add('hidden');
        exitSearchMode();
        searchInput.focus();
    });
}

function performSettingsSearch(query) {
    const resultsContainer = document.getElementById('search-results-container');
    const resultsPanel = document.getElementById('search-results-panel');
    const countEl = document.getElementById('search-results-count');
    const noResultsEl = document.getElementById('no-search-results');
    
    if (!resultsContainer || !resultsPanel) return;
    
    // Clear previous results
    resultsContainer.innerHTML = '';
    
    // Find matching settings
    const allSettings = document.querySelectorAll('.settings-panel:not([data-panel="search-results"]) .setting-row');
    const matches = [];
    
    allSettings.forEach(row => {
        const searchable = row.dataset.searchable || '';
        const label = row.querySelector('.setting-info label')?.textContent || '';
        const description = row.querySelector('.setting-description')?.textContent || '';
        const combined = `${searchable} ${label} ${description}`.toLowerCase();
        
        if (combined.includes(query)) {
            matches.push(row.cloneNode(true));
        }
    });
    
    // Update UI
    countEl.textContent = `${matches.length} setting${matches.length !== 1 ? 's' : ''} found`;
    
    if (matches.length > 0) {
        noResultsEl.classList.add('hidden');
        matches.forEach(match => {
            match.classList.add('highlight');
            resultsContainer.appendChild(match);
        });
        
        // Rebind listeners for cloned elements
        rebindSettingRowListeners(resultsContainer);
    } else {
        noResultsEl.classList.remove('hidden');
    }
    
    // Switch to search results panel
    document.querySelectorAll('.settings-nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === 'search-results');
    });
}

function rebindSettingRowListeners(container) {
    // Rebind toggle switches
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const category = e.target.dataset.category;
            const key = e.target.dataset.key;
            if (category && key) {
                updateSetting(category, key, e.target.checked);
                // Also update the original
                const original = document.querySelector(`.settings-panel:not([data-panel="search-results"]) [data-category="${category}"][data-key="${key}"]`);
                if (original && original.type === 'checkbox') {
                    original.checked = e.target.checked;
                }
            }
        });
    });
    
    // Rebind selects
    container.querySelectorAll('select').forEach(select => {
        select.addEventListener('change', (e) => {
            const category = e.target.dataset.category;
            const key = e.target.dataset.key;
            if (category && key) {
                updateSetting(category, key, e.target.value);
            }
        });
    });
    
    // Rebind number inputs
    container.querySelectorAll('input[type="number"]').forEach(input => {
        let debounceTimer;
        input.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const category = e.target.dataset.category;
                const key = e.target.dataset.key;
                const value = parseInt(e.target.value, 10);
                if (category && key && !isNaN(value)) {
                    updateSetting(category, key, value);
                }
            }, 500);
        });
    });
    
    // Rebind +/- buttons
    container.querySelectorAll('.number-input-wrapper').forEach(wrapper => {
        const input = wrapper.querySelector('input[type="number"]');
        const minusBtn = wrapper.querySelector('.number-btn.minus');
        const plusBtn = wrapper.querySelector('.number-btn.plus');
        
        if (input && minusBtn && plusBtn) {
            const step = parseInt(input.step) || 1;
            const min = parseInt(input.min) || 0;
            const max = parseInt(input.max) || 100;
            
            minusBtn.addEventListener('click', () => {
                const current = parseInt(input.value) || 0;
                input.value = Math.max(min, current - step);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            
            plusBtn.addEventListener('click', () => {
                const current = parseInt(input.value) || 0;
                input.value = Math.min(max, current + step);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
    });
}

function exitSearchMode() {
    // Return to first panel
    switchSettingsPanel('download');
}

function handleSettingsReset() {
    showConfirmationModal({
        title: 'Reset All Settings',
        message: 'Are you sure you want to reset all settings to their default values? This cannot be undone.',
        icon: 'fa-undo',
        onConfirm: async () => {
            try {
                const res = await fetch('/api/settings/reset', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    loadSettings();
                    showSaveIndicator();
                }
            } catch (err) {
                console.error('Failed to reset settings:', err);
            }
        }
    });
}

// Settings Modal Functions
function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
        loadSettings(); // Refresh settings when opening
        
        // Reset to first panel
        switchSettingsPanel('download');
        
        // Clear any previous search
        const searchInput = document.getElementById('settings-search');
        if (searchInput) {
            searchInput.value = '';
            document.getElementById('settings-search-clear').classList.add('hidden');
        }
    }
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // Restore scroll
    }
}

// Add Track Modal Functions
function openAddTrackModal() {
    const modal = document.getElementById('add-track-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        // Focus the input field
        setTimeout(() => {
            const input = document.getElementById('song-url');
            if (input) input.focus();
        }, 100);
    }
}

function closeAddTrackModal() {
    const modal = document.getElementById('add-track-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Confirmation Modal Functions
let confirmationCallback = null;

function showConfirmationModal({ title, message, icon = 'fa-exclamation-triangle', onConfirm }) {
    const modal = document.getElementById('confirmation-modal');
    const titleEl = document.getElementById('confirmation-title');
    const messageEl = document.getElementById('confirmation-message');
    const iconEl = document.getElementById('confirmation-icon');
    
    if (!modal || !titleEl || !messageEl || !iconEl) return;
    
    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;
    iconEl.className = `fas ${icon}`;
    
    // Store callback
    confirmationCallback = onConfirm;
    
    // Show modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeConfirmationModal() {
    const modal = document.getElementById('confirmation-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        confirmationCallback = null;
    }
}

function initConfirmationModalListeners() {
    const modal = document.getElementById('confirmation-modal');
    const closeBtn = document.getElementById('confirmation-modal-close');
    const cancelBtn = document.getElementById('confirmation-cancel');
    const confirmBtn = document.getElementById('confirmation-confirm');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeConfirmationModal);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeConfirmationModal);
    }
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            if (confirmationCallback) {
                confirmationCallback();
            }
            closeConfirmationModal();
        });
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'confirmation-modal') {
                closeConfirmationModal();
            }
        });
    }
}

function initAddTrackModalListeners() {
    const addBtn = document.getElementById('add-song-btn');
    const closeBtn = document.getElementById('add-track-modal-close');
    const modal = document.getElementById('add-track-modal');
    
    if (addBtn) {
        addBtn.addEventListener('click', openAddTrackModal);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeAddTrackModal);
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'add-track-modal') {
                closeAddTrackModal();
            }
        });
    }
}

// ============================================
// AUDIO EFFECTS SYSTEM
// ============================================

let currentEffects = null;
let effectsPresets = [];
let effectsUpdateTimeout = null;
let effectsBackend = 'ffplay';
let effectsSeamless = false;

/**
 * Fetch current effects settings from server
 */
async function loadEffects() {
    try {
        const response = await fetch('/api/effects');
        if (response.ok) {
            const data = await response.json();
            currentEffects = data.effects;
            effectsPresets = data.presets;
            effectsBackend = data.backend || 'ffplay';
            effectsSeamless = data.seamless || false;
            updateEffectsUI(currentEffects);
            renderEffectsPresets(effectsPresets, currentEffects.preset);
            updateBackendIndicator();
        }
    } catch (err) {
        console.error('Failed to load effects:', err);
    }
}

/**
 * Update the backend indicator in the UI
 */
function updateBackendIndicator() {
    const badge = document.getElementById('effects-active-badge');
    if (badge) {
        if (effectsSeamless) {
            badge.title = 'MPV backend: Seamless effect changes';
        } else {
            badge.title = 'ffplay backend: Effect changes may cause brief audio gap';
        }
    }
}

/**
 * Update effects settings on server
 */
async function updateEffects(newSettings) {
    try {
        const response = await fetch('/api/effects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });
        if (response.ok) {
            const data = await response.json();
            currentEffects = data.effects;
            updateEffectsUI(currentEffects);
            updateCurrentPresetDisplay(currentEffects.preset);
            showEffectsSaveIndicator();
        }
    } catch (err) {
        console.error('Failed to update effects:', err);
    }
}

/**
 * Apply a preset
 */
async function applyEffectsPreset(presetId) {
    try {
        const response = await fetch(`/api/effects/preset/${presetId}`, {
            method: 'POST'
        });
        if (response.ok) {
            const data = await response.json();
            currentEffects = data.effects;
            updateEffectsUI(currentEffects);
            updateCurrentPresetDisplay(currentEffects.preset);
            highlightActivePreset(presetId);
            showEffectsSaveIndicator();
        }
    } catch (err) {
        console.error('Failed to apply preset:', err);
    }
}

/**
 * Reset all effects to default
 */
async function resetAllEffects() {
    try {
        const response = await fetch('/api/effects/reset', {
            method: 'POST'
        });
        if (response.ok) {
            const data = await response.json();
            currentEffects = data.effects;
            updateEffectsUI(currentEffects);
            updateCurrentPresetDisplay('normal');
            highlightActivePreset('normal');
            showEffectsSaveIndicator();
        }
    } catch (err) {
        console.error('Failed to reset effects:', err);
    }
}

/**
 * Update the effects UI with current settings
 */
function updateEffectsUI(effects) {
    if (!effects) return;
    
    // Master toggle
    const enabledToggle = document.getElementById('effects-enabled');
    if (enabledToggle) enabledToggle.checked = effects.enabled;
    
    // Speed
    const speedSlider = document.getElementById('effect-speed');
    const speedValue = document.getElementById('effect-speed-value');
    if (speedSlider) {
        speedSlider.value = effects.speed;
        if (speedValue) speedValue.textContent = `${effects.speed.toFixed(2)}x`;
    }
    
    // EQ
    updateEQSlider('bass', effects.eq?.bass || 0);
    updateEQSlider('mid', effects.eq?.mid || 0);
    updateEQSlider('treble', effects.eq?.treble || 0);
    
    // Reverb
    updateEffectCard('reverb', effects.reverb);
    
    // Echo
    updateEffectCard('echo', effects.echo);
    
    // Distortion
    updateEffectCard('distortion', effects.distortion);
    
    // Compressor
    updateEffectCard('compressor', effects.compressor);
}

/**
 * Update an EQ slider
 */
function updateEQSlider(band, value) {
    const slider = document.getElementById(`effect-eq-${band}`);
    const valueDisplay = document.getElementById(`effect-eq-${band}-value`);
    if (slider) {
        slider.value = value;
        if (valueDisplay) {
            const prefix = value > 0 ? '+' : '';
            valueDisplay.textContent = `${prefix}${value}`;
        }
    }
}

/**
 * Update an effect card (toggle + controls)
 */
function updateEffectCard(effectName, settings) {
    if (!settings) return;
    
    const enabledToggle = document.getElementById(`effect-${effectName}-enabled`);
    if (enabledToggle) enabledToggle.checked = settings.enabled;
    
    const controls = document.getElementById(`effect-${effectName}-controls`);
    if (controls) {
        controls.style.opacity = settings.enabled ? '1' : '0.5';
        controls.style.pointerEvents = settings.enabled ? 'auto' : 'none';
    }
    
    // Update individual sliders
    Object.entries(settings).forEach(([key, value]) => {
        if (key === 'enabled') return;
        const slider = document.getElementById(`effect-${effectName}-${key}`);
        if (slider) {
            slider.value = value;
            const valueDisplay = slider.parentElement.querySelector('.mini-value');
            if (valueDisplay) {
                valueDisplay.textContent = formatEffectValue(effectName, key, value);
            }
        }
    });
}

/**
 * Format effect value for display
 */
function formatEffectValue(effectName, key, value) {
    if (key === 'delay') return `${value}ms`;
    if (key === 'threshold') return `${value}dB`;
    if (key === 'ratio') return `${value}:1`;
    return value.toFixed ? value.toFixed(2) : value;
}

/**
 * Render preset buttons
 */
function renderEffectsPresets(presets, currentPreset) {
    const container = document.getElementById('effects-presets-grid');
    if (!container) return;
    
    container.innerHTML = presets.map(preset => `
        <button class="effects-preset-btn ${preset.id === currentPreset ? 'active' : ''}" 
                data-preset="${preset.id}" 
                title="${preset.description}">
            <i class="fas ${preset.icon}"></i>
            <span>${preset.name}</span>
        </button>
    `).join('');
    
    // Add click listeners
    container.querySelectorAll('.effects-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyEffectsPreset(btn.dataset.preset);
        });
    });
}

/**
 * Highlight active preset button
 */
function highlightActivePreset(presetId) {
    document.querySelectorAll('.effects-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === presetId);
    });
}

/**
 * Update current preset display
 */
function updateCurrentPresetDisplay(presetId) {
    // Update badge in card header
    const badge = document.getElementById('effects-active-badge');
    if (badge) {
        const preset = effectsPresets.find(p => p.id === presetId);
        const nameEl = badge.querySelector('.preset-name');
        if (nameEl) {
            nameEl.textContent = preset ? preset.name : 'Custom';
        }
    }
}

/**
 * Show save indicator for effects
 */
function showEffectsSaveIndicator() {
    const indicator = document.getElementById('settings-save-indicator');
    if (indicator) {
        indicator.classList.add('visible');
        setTimeout(() => indicator.classList.remove('visible'), 2000);
    }
}

/**
 * Debounced effects update
 */
function debouncedEffectsUpdate(newSettings) {
    if (effectsUpdateTimeout) {
        clearTimeout(effectsUpdateTimeout);
    }
    effectsUpdateTimeout = setTimeout(() => {
        updateEffects(newSettings);
    }, 300);
}

/**
 * Initialize effects listeners
 */
function initEffectsListeners() {
    // Expand/Collapse button
    const expandBtn = document.getElementById('effects-expand-btn');
    const effectsCard = document.getElementById('effects-card');
    if (expandBtn && effectsCard) {
        expandBtn.addEventListener('click', () => {
            effectsCard.classList.toggle('expanded');
        });
    }
    
    // Master toggle
    const enabledToggle = document.getElementById('effects-enabled');
    if (enabledToggle) {
        enabledToggle.addEventListener('change', () => {
            debouncedEffectsUpdate({ enabled: enabledToggle.checked });
        });
    }
    
    // Speed slider
    const speedSlider = document.getElementById('effect-speed');
    const speedValue = document.getElementById('effect-speed-value');
    if (speedSlider) {
        speedSlider.addEventListener('input', () => {
            const val = parseFloat(speedSlider.value);
            if (speedValue) speedValue.textContent = `${val.toFixed(2)}x`;
        });
        speedSlider.addEventListener('change', () => {
            debouncedEffectsUpdate({ speed: parseFloat(speedSlider.value) });
        });
    }
    
    // EQ sliders
    ['bass', 'mid', 'treble'].forEach(band => {
        const slider = document.getElementById(`effect-eq-${band}`);
        const valueDisplay = document.getElementById(`effect-eq-${band}-value`);
        if (slider) {
            slider.addEventListener('input', () => {
                const val = parseInt(slider.value);
                if (valueDisplay) {
                    const prefix = val > 0 ? '+' : '';
                    valueDisplay.textContent = `${prefix}${val}`;
                }
            });
            slider.addEventListener('change', () => {
                const eq = {
                    bass: parseInt(document.getElementById('effect-eq-bass')?.value || 0),
                    mid: parseInt(document.getElementById('effect-eq-mid')?.value || 0),
                    treble: parseInt(document.getElementById('effect-eq-treble')?.value || 0)
                };
                eq[band] = parseInt(slider.value);
                debouncedEffectsUpdate({ eq });
            });
        }
    });
    
    // Effect card toggles and sliders
    initEffectCardListeners('reverb', ['roomSize', 'wetLevel']);
    initEffectCardListeners('echo', ['delay', 'decay']);
    initEffectCardListeners('distortion', ['drive']);
    initEffectCardListeners('compressor', ['threshold', 'ratio']);
    
    // Reset all button
    const resetBtn = document.getElementById('effects-reset-all');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetAllEffects);
    }
    
    // Individual reset buttons
    document.querySelectorAll('.effect-reset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            const defaultVal = parseFloat(btn.dataset.default);
            const slider = document.getElementById(target);
            if (slider) {
                slider.value = defaultVal;
                slider.dispatchEvent(new Event('input'));
                slider.dispatchEvent(new Event('change'));
            }
        });
    });
}

/**
 * Initialize listeners for an effect card
 */
function initEffectCardListeners(effectName, params) {
    const enabledToggle = document.getElementById(`effect-${effectName}-enabled`);
    const controls = document.getElementById(`effect-${effectName}-controls`);
    
    if (enabledToggle) {
        enabledToggle.addEventListener('change', () => {
            const settings = { enabled: enabledToggle.checked };
            params.forEach(param => {
                const slider = document.getElementById(`effect-${effectName}-${param}`);
                if (slider) {
                    settings[param] = parseFloat(slider.value);
                }
            });
            
            if (controls) {
                controls.style.opacity = enabledToggle.checked ? '1' : '0.5';
                controls.style.pointerEvents = enabledToggle.checked ? 'auto' : 'none';
            }
            
            debouncedEffectsUpdate({ [effectName]: settings });
        });
    }
    
    params.forEach(param => {
        const slider = document.getElementById(`effect-${effectName}-${param}`);
        if (slider) {
            slider.addEventListener('input', () => {
                const val = parseFloat(slider.value);
                const valueDisplay = slider.parentElement.querySelector('.mini-value');
                if (valueDisplay) {
                    valueDisplay.textContent = formatEffectValue(effectName, param, val);
                }
            });
            slider.addEventListener('change', () => {
                const settings = { enabled: enabledToggle?.checked || false };
                params.forEach(p => {
                    const s = document.getElementById(`effect-${effectName}-${p}`);
                    if (s) settings[p] = parseFloat(s.value);
                });
                debouncedEffectsUpdate({ [effectName]: settings });
            });
        }
    });
}

// Groups Management Functions
async function loadGroups() {
    const container = document.getElementById('groups-list');
    const countEl = document.getElementById('groups-count');
    
    if (!container) return;
    
    try {
        container.innerHTML = '<div class="groups-loading"><i class="fas fa-circle-notch fa-spin"></i><span>Loading groups...</span></div>';
        
        const res = await fetch('/api/groups');
        if (!res.ok) throw new Error('Failed to fetch groups');
        
        const data = await res.json();
        const groups = data.groups || [];
        
        if (countEl) {
            countEl.textContent = groups.length;
        }
        
        if (groups.length === 0) {
            container.innerHTML = '<div class="groups-empty"><i class="fas fa-users"></i><span>No groups monitored yet. Send !ping in a group to add it.</span></div>';
        } else {
            container.innerHTML = groups.map(group => {
                const addedDate = group.addedAt ? new Date(group.addedAt).toLocaleDateString() : 'Unknown';
                return `
                    <div class="groups-item" data-group-id="${group.id}">
                        <div class="groups-item-info">
                            <div class="groups-item-name">${escapeHtml(group.name)}</div>
                            <div class="groups-item-id">${escapeHtml(group.id)}</div>
                            <div class="groups-item-date">Added: ${addedDate}</div>
                        </div>
                        <button type="button" class="groups-remove-btn" onclick="removeGroup('${group.id}')" title="Remove group">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading groups:', error);
        container.innerHTML = '<div class="groups-error"><i class="fas fa-exclamation-triangle"></i><span>Failed to load groups</span></div>';
    }
    
    // Also load pending confirmations
    await loadPendingConfirmations();
}

async function loadPendingConfirmations() {
    const container = document.getElementById('groups-pending-list');
    const pendingContainer = document.getElementById('groups-pending-container');
    const countEl = document.getElementById('pending-count');
    
    if (!container) return;
    
    try {
        const res = await fetch('/api/groups/pending');
        if (!res.ok) throw new Error('Failed to fetch pending confirmations');
        
        const data = await res.json();
        const pending = data.pending || [];
        
        if (countEl) {
            countEl.textContent = pending.length;
        }
        
        if (pending.length === 0) {
            if (pendingContainer) pendingContainer.style.display = 'none';
            return;
        }
        
        if (pendingContainer) pendingContainer.style.display = 'block';
        
        container.innerHTML = pending.map(confirmation => {
            const timeAgo = getTimeAgo(confirmation.timestamp);
            return `
                <div class="groups-item groups-item-pending" data-group-id="${confirmation.groupId}">
                    <div class="groups-item-info">
                        <div class="groups-item-name">${escapeHtml(confirmation.groupName)}</div>
                        <div class="groups-item-id">${escapeHtml(confirmation.groupId)}</div>
                        <div class="groups-item-meta">
                            <span><i class="fas fa-user"></i> ${escapeHtml(confirmation.senderName)}</span>
                            <span><i class="fas fa-clock"></i> ${timeAgo}</span>
                        </div>
                    </div>
                    <div class="groups-item-actions">
                        <button type="button" class="groups-confirm-btn" onclick="confirmGroup('${confirmation.groupId}')" title="Confirm">
                            <i class="fas fa-check"></i>
                        </button>
                        <button type="button" class="groups-reject-btn" onclick="rejectGroup('${confirmation.groupId}')" title="Reject">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading pending confirmations:', error);
        if (pendingContainer) pendingContainer.style.display = 'none';
    }
}

async function addGroup(groupId) {
    if (!groupId || !groupId.includes('@g.us')) {
        showConfirmationModal({
            title: 'Invalid Group ID',
            message: 'Group ID must be a WhatsApp group ID (ending with @g.us)',
            icon: 'fa-exclamation-triangle',
            onConfirm: () => {}
        });
        return;
    }
    
    showConfirmationModal({
        title: 'Add Group',
        message: `Add group "${groupId}" to monitoring? The bot will start listening to messages from this group.`,
        icon: 'fa-plus-circle',
        onConfirm: async () => {
            try {
                const res = await fetch('/api/groups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ groupId })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    await loadGroups();
                    showSaveIndicator();
                } else {
                    showConfirmationModal({
                        title: 'Error',
                        message: data.error || 'Failed to add group',
                        icon: 'fa-exclamation-triangle',
                        onConfirm: () => {}
                    });
                }
            } catch (error) {
                console.error('Error adding group:', error);
                showConfirmationModal({
                    title: 'Error',
                    message: 'Failed to add group. Please try again.',
                    icon: 'fa-exclamation-triangle',
                    onConfirm: () => {}
                });
            }
        }
    });
}

async function removeGroup(groupId) {
    // Get group name for better confirmation message
    let groupName = groupId;
    try {
        const res = await fetch('/api/groups');
        if (res.ok) {
            const data = await res.json();
            const group = data.groups?.find(g => g.id === groupId);
            if (group) {
                groupName = group.name;
            }
        }
    } catch (e) {
        // Ignore error, use groupId as fallback
    }
    
    showConfirmationModal({
        title: 'Remove Group',
        message: `Are you sure you want to remove "${groupName}" from monitoring? The bot will stop listening to messages from this group.`,
        icon: 'fa-trash',
        onConfirm: async () => {
            try {
                const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, {
                    method: 'DELETE'
                });
                
                const data = await res.json();
                
                if (data.success) {
                    await loadGroups();
                    showSaveIndicator();
                } else {
                    showConfirmationModal({
                        title: 'Error',
                        message: data.error || 'Failed to remove group',
                        icon: 'fa-exclamation-triangle',
                        onConfirm: () => {}
                    });
                }
            } catch (error) {
                console.error('Error removing group:', error);
                showConfirmationModal({
                    title: 'Error',
                    message: 'Failed to remove group. Please try again.',
                    icon: 'fa-exclamation-triangle',
                    onConfirm: () => {}
                });
            }
        }
    });
}

async function confirmGroup(groupId) {
    // Get group info for confirmation message
    let groupName = groupId;
    let senderName = 'Unknown';
    try {
        const res = await fetch('/api/groups/pending');
        if (res.ok) {
            const data = await res.json();
            const pending = data.pending?.find(p => p.groupId === groupId);
            if (pending) {
                groupName = pending.groupName;
                senderName = pending.senderName;
            }
        }
    } catch (e) {
        // Ignore error, use defaults
    }
    
    showConfirmationModal({
        title: 'Confirm Group',
        message: `Add "${groupName}" to monitored groups? This group was requested by ${senderName}.`,
        icon: 'fa-check-circle',
        onConfirm: async () => {
            try {
                const res = await fetch(`/api/groups/pending/${encodeURIComponent(groupId)}/confirm`, {
                    method: 'POST'
                });
                
                const data = await res.json();
                
                if (data.success) {
                    await loadGroups();
                    showSaveIndicator();
                } else {
                    showConfirmationModal({
                        title: 'Error',
                        message: data.error || 'Failed to confirm group',
                        icon: 'fa-exclamation-triangle',
                        onConfirm: () => {}
                    });
                }
            } catch (error) {
                console.error('Error confirming group:', error);
                showConfirmationModal({
                    title: 'Error',
                    message: 'Failed to confirm group. Please try again.',
                    icon: 'fa-exclamation-triangle',
                    onConfirm: () => {}
                });
            }
        }
    });
}

async function rejectGroup(groupId) {
    // Get group info for confirmation message
    let groupName = groupId;
    let senderName = 'Unknown';
    try {
        const res = await fetch('/api/groups/pending');
        if (res.ok) {
            const data = await res.json();
            const pending = data.pending?.find(p => p.groupId === groupId);
            if (pending) {
                groupName = pending.groupName;
                senderName = pending.senderName;
            }
        }
    } catch (e) {
        // Ignore error, use defaults
    }
    
    showConfirmationModal({
        title: 'Reject Group Request',
        message: `Are you sure you want to reject the request to add "${groupName}"? This request was sent by ${senderName}.`,
        icon: 'fa-times-circle',
        onConfirm: async () => {
            try {
                const res = await fetch(`/api/groups/pending/${encodeURIComponent(groupId)}/reject`, {
                    method: 'POST'
                });
                
                const data = await res.json();
                
                if (data.success) {
                    await loadPendingConfirmations();
                } else {
                    showConfirmationModal({
                        title: 'Error',
                        message: data.error || 'Failed to reject group request',
                        icon: 'fa-exclamation-triangle',
                        onConfirm: () => {}
                    });
                }
            } catch (error) {
                console.error('Error rejecting group:', error);
                showConfirmationModal({
                    title: 'Error',
                    message: 'Failed to reject group request. Please try again.',
                    icon: 'fa-exclamation-triangle',
                    onConfirm: () => {}
                });
            }
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// Initialize settings on load
loadSettings();
loadEffects();
initSettingsListeners();
initEffectsListeners();
initAddTrackModalListeners();
initConfirmationModalListeners();

// Listeners
document.getElementById('add-song-form').addEventListener('submit', addSong);
document.getElementById('skip-btn').addEventListener('click', skipSong);
document.getElementById('play-pause-btn').addEventListener('click', togglePause);
document.getElementById('add-vip-form').addEventListener('submit', addVip);
document.getElementById('fullscreen-btn').addEventListener('click', openFullscreenWindow);
document.getElementById('new-session-btn').addEventListener('click', startNewSession);
document.getElementById('prefetch-btn').addEventListener('click', prefetchAll);
document.getElementById('stats-collapse-btn').addEventListener('click', toggleStatsCollapse);

// Setup seek functionality (will be called after DOM is ready)
setupSeekFunctionality();

// Initialize VIP area unlock state
initializeVipArea();

// Polling interval handles both queue updates and auth checks
setInterval(fetchData, 2000);

// Update progress bar and stats every second for smoother updates
setInterval(updateProgressBarAndStats, 1000);

// Initial fetch
fetchData();
