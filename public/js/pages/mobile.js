/**
 * Mobile VIP Access Page
 * Handles authentication, real-time updates, and mobile interactions
 */

// Global state
let mobileToken = null;
let deviceFingerprint = null;
let isAuthenticated = false;
let currentEffects = null;
let effectsPresets = [];
let effectsEventSource = null;
let mobileStatusEventSource = null;

// Broadcast Channel for syncing effects across devices
const effectsBroadcast = new BroadcastChannel('wabisaby_audio_channel');

// Extract token from URL
function getTokenFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
}

// Format time helper
function formatTime(ms) {
    if (!ms || isNaN(ms)) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Show error message
async function showError(message) {
    const errorEl = document.getElementById('auth-error');
    const messageEl = document.getElementById('auth-message');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
    if (messageEl) {
        messageEl.textContent = await window.i18n.t('ui.mobile.authenticationFailed');
    }
}

// Show success and hide auth screen
function showMainInterface() {
    const authScreen = document.getElementById('auth-screen');
    const mainInterface = document.getElementById('mobile-interface');
    if (authScreen) authScreen.classList.add('hidden');
    if (mainInterface) mainInterface.classList.remove('hidden');
}

// Authenticate with token and fingerprint
async function authenticate() {
    const token = getTokenFromURL();
    if (!token) {
        showError(await window.i18n.t('ui.mobile.noToken'));
        return false;
    }
    
    mobileToken = token;
    
    // Update auth message
    const messageEl = document.getElementById('auth-message');
    if (messageEl) {
        messageEl.textContent = await window.i18n.t('ui.mobile.authenticating');
    }
    
    try {
        // Generate device fingerprint
        deviceFingerprint = await generateDeviceFingerprint();
        
        // Send authentication request
        const response = await fetch('/api/mobile/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token: mobileToken,
                fingerprint: deviceFingerprint
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            isAuthenticated = true;
            showMainInterface();
            initializeMobileInterface();
            return true;
        } else {
            const errorMsg = data.message || data.error || await window.i18n.t('ui.mobile.authenticationFailed');
            showError(errorMsg);
            return false;
        }
    } catch (error) {
        console.error('Authentication error:', error);
        showError(await window.i18n.t('ui.mobile.connectionFailed'));
        return false;
    }
}

// Initialize mobile interface after authentication
function initializeMobileInterface() {
    // Load initial data
    fetchMobileStatus();
    loadMobileEffects();
    
    // Connect to SSE stream for real-time status updates
    connectMobileStatusSSE();
    
    // Set up effects controls
    setupEffectsControls();
    
    // Set up BroadcastChannel listener for effects updates (same-browser tabs)
    setupEffectsBroadcastListener();
    
    // Set up SSE connection for cross-device effects updates
    connectEffectsSSE();
    
    // Set up expand/collapse for effects
    const expandBtn = document.getElementById('mobile-effects-expand-btn');
    const expandedContent = document.getElementById('mobile-effects-expanded');
    if (expandBtn && expandedContent) {
        expandBtn.addEventListener('click', () => {
            expandedContent.classList.toggle('hidden');
            const icon = expandBtn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-chevron-down');
                icon.classList.toggle('fa-chevron-up');
            }
        });
    }
}

// Fetch mobile status
async function fetchMobileStatus() {
    if (!isAuthenticated || !mobileToken) return;
    
    try {
        const response = await fetch(`/api/mobile/status?token=${mobileToken}`, {
            headers: {
                'X-Device-Fingerprint': deviceFingerprint
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            updateMobileUI(data);
        } else if (response.status === 401 || response.status === 403) {
            // Authentication failed, redirect to auth screen
            isAuthenticated = false;
            showError('Session expired. Please refresh the page.');
        }
    } catch (error) {
        console.error('Error fetching mobile status:', error);
    }
}

// Update mobile UI with status data
function updateMobileUI(data) {
    const { queue, auth, user } = data;
    const currentSong = queue?.currentSong;
    
    // Update connection status
    const statusBadge = document.getElementById('mobile-connection-status');
    if (statusBadge) {
        // Remove all status classes first
        statusBadge.classList.remove('online', 'offline', 'action-required');
        
        if (auth && auth.actionRequired) {
            statusBadge.classList.add('action-required');
            const statusText = statusBadge.querySelector('span:not(.dot)');
            if (statusText) {
                const actionRequiredText = window.i18n?.tSync('ui.dashboard.nav.actionRequired') || 'ACTION REQUIRED';
                statusText.textContent = actionRequiredText;
            }
        } else if (auth && auth.isConnected) {
            statusBadge.classList.add('online');
            const statusText = statusBadge.querySelector('span:not(.dot)');
            if (statusText) statusText.textContent = window.i18n.tSync('ui.mobile.live');
        } else {
            statusBadge.classList.add('offline');
            const statusText = statusBadge.querySelector('span:not(.dot)');
            if (statusText) statusText.textContent = 'OFFLINE';
        }
    }
    
    // Update user profile picture
    updateUserProfilePicture(user);
    
    // Update now playing
    updateNowPlaying(currentSong);
    
    // Update queue
    updateQueue(queue?.queue || []);
}

// Update user profile picture
function updateUserProfilePicture(user) {
    const avatarEl = document.getElementById('mobile-user-avatar');
    if (!avatarEl) return;
    
    if (user && user.profilePicUrl) {
        avatarEl.innerHTML = `<img src="${user.profilePicUrl}" alt="${user.name || 'User'}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>';" />`;
    } else {
        avatarEl.innerHTML = '<i class="fas fa-user"></i>';
    }
}

// Update now playing section
function updateNowPlaying(currentSong) {
    const artworkEl = document.getElementById('mobile-np-artwork');
    const infoEl = document.getElementById('mobile-np-info');
    const progressEl = document.getElementById('mobile-np-progress');
    const progressBar = document.getElementById('mobile-progress-bar');
    const currentTimeEl = document.getElementById('mobile-current-time');
    const totalTimeEl = document.getElementById('mobile-total-time');
    
    if (!currentSong) {
        // Show idle state
        if (infoEl) {
            infoEl.innerHTML = `
                <div class="mobile-np-idle">
                    <span>${window.i18n.tSync('ui.mobile.readyToPlay')}</span>
                    <p>${window.i18n.tSync('ui.mobile.waitingForMusic')}</p>
                </div>
            `;
        }
        if (progressEl) progressEl.classList.add('hidden');
        if (artworkEl) {
            artworkEl.innerHTML = '<i class="fas fa-compact-disc"></i>';
        }
        return;
    }
    
    // Update artwork
    if (artworkEl) {
        if (currentSong.thumbnailUrl) {
            artworkEl.innerHTML = `<img src="${currentSong.thumbnailUrl}" alt="${currentSong.title || 'Song'}">`;
        } else {
            artworkEl.innerHTML = '<i class="fas fa-compact-disc"></i>';
        }
    }
    
    // Update info
    const title = currentSong.title || 'Unknown Title';
    const artist = currentSong.artist || '';
    if (infoEl) {
        infoEl.innerHTML = `
            <div class="mobile-np-title">${title}</div>
            ${artist ? `<div class="mobile-np-artist">${artist}</div>` : ''}
        `;
    }
    
    // Update progress
    if (currentSong.duration && currentSong.elapsed !== undefined) {
        if (progressEl) progressEl.classList.remove('hidden');
        
        const progress = Math.min((currentSong.elapsed / currentSong.duration) * 100, 100);
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        
        if (currentTimeEl) {
            currentTimeEl.textContent = formatTime(currentSong.elapsed);
        }
        if (totalTimeEl) {
            totalTimeEl.textContent = formatTime(currentSong.duration);
        }
    } else {
        if (progressEl) progressEl.classList.add('hidden');
    }
}

// Update queue list
function updateQueue(queue) {
    const queueList = document.getElementById('mobile-queue-list');
    const queueCount = document.getElementById('mobile-queue-count');
    
    if (queueCount) {
        queueCount.textContent = queue.length;
    }
    
    if (!queueList) return;
    
    if (queue.length === 0) {
        queueList.innerHTML = `<li class="mobile-queue-empty">${window.i18n.tSync('ui.mobile.queueEmpty')}</li>`;
        return;
    }
    
    queueList.innerHTML = queue.map((item, index) => {
        const title = item.title || 'Unknown Title';
        const artist = item.artist || '';
        const thumbnail = item.thumbnailUrl ? `<img src="${item.thumbnailUrl}" alt="${title}">` : '<i class="fas fa-music"></i>';
        
        return `
            <li class="mobile-queue-item">
                <div class="mobile-queue-artwork">${thumbnail}</div>
                <div class="mobile-queue-info">
                    <div class="mobile-queue-title">${title}</div>
                    ${artist ? `<div class="mobile-queue-artist">${artist}</div>` : ''}
                </div>
                <div class="mobile-queue-position">#${index + 1}</div>
            </li>
        `;
    }).join('');
}

// Load mobile effects
async function loadMobileEffects() {
    if (!isAuthenticated || !mobileToken) return;
    
    try {
        const response = await fetch(`/api/mobile/effects?token=${mobileToken}`, {
            headers: {
                'X-Device-Fingerprint': deviceFingerprint
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentEffects = data.effects;
            effectsPresets = data.presets || [];
            updateMobileEffectsUI(currentEffects);
            renderMobilePresets(effectsPresets, currentEffects.preset);
            // Broadcast initial effects to sync with other tabs/devices
            effectsBroadcast.postMessage({ type: 'EFFECTS_UPDATE', effects: currentEffects });
        }
    } catch (error) {
        console.error('Error loading mobile effects:', error);
    }
}

// Update mobile effects UI
function updateMobileEffectsUI(effects) {
    if (!effects) return;
    
    // Speed
    const speedSlider = document.getElementById('mobile-effect-speed');
    const speedValue = document.getElementById('mobile-speed-value');
    if (speedSlider) {
        speedSlider.value = effects.speed || 1;
        if (speedValue) speedValue.textContent = `${(effects.speed || 1).toFixed(2)}x`;
    }
    
    // EQ
    updateMobileEQ('bass', effects.eq?.bass || 0);
    updateMobileEQ('mid', effects.eq?.mid || 0);
    updateMobileEQ('treble', effects.eq?.treble || 0);
    
    // Effect toggles
    const reverbToggle = document.getElementById('mobile-effect-reverb-enabled');
    const echoToggle = document.getElementById('mobile-effect-echo-enabled');
    const distortionToggle = document.getElementById('mobile-effect-distortion-enabled');
    const compressorToggle = document.getElementById('mobile-effect-compressor-enabled');
    
    if (reverbToggle) reverbToggle.checked = effects.reverb?.enabled || false;
    if (echoToggle) echoToggle.checked = effects.echo?.enabled || false;
    if (distortionToggle) distortionToggle.checked = effects.distortion?.enabled || false;
    if (compressorToggle) compressorToggle.checked = effects.compressor?.enabled || false;
    
    // Update badge
    const badge = document.getElementById('mobile-effects-badge');
    if (badge) {
        const presetName = effects.preset || 'Normal';
        badge.querySelector('span').textContent = presetName;
    }
}

// Update mobile EQ slider
function updateMobileEQ(band, value) {
    const slider = document.getElementById(`mobile-effect-eq-${band}`);
    const valueEl = document.getElementById(`mobile-eq-${band}-value`);
    if (slider) {
        slider.value = value;
        if (valueEl) valueEl.textContent = value;
    }
}

// Render mobile presets
function renderMobilePresets(presets, currentPreset) {
    const presetsGrid = document.getElementById('mobile-presets-grid');
    if (!presetsGrid) return;
    
    if (!presets || presets.length === 0) {
        presetsGrid.innerHTML = '';
        return;
    }
    
    presetsGrid.innerHTML = presets.map(preset => {
        const isActive = preset.id === currentPreset;
        return `
            <button class="mobile-preset-btn ${isActive ? 'active' : ''}" 
                    data-preset-id="${preset.id}"
                    onclick="applyMobilePreset('${preset.id}')">
                ${preset.name}
            </button>
        `;
    }).join('');
}

// Apply mobile preset
async function applyMobilePreset(presetId) {
    if (!isAuthenticated || !mobileToken) return;
    
    try {
        const response = await fetch(`/api/mobile/effects/preset/${presetId}?token=${mobileToken}`, {
            method: 'POST',
            headers: {
                'X-Device-Fingerprint': deviceFingerprint
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentEffects = data.effects;
            updateMobileEffectsUI(currentEffects);
            renderMobilePresets(effectsPresets, currentEffects.preset);
            // Broadcast update to sync with other devices/tabs
            effectsBroadcast.postMessage({ type: 'EFFECTS_UPDATE', effects: currentEffects });
        }
    } catch (error) {
        console.error('Error applying preset:', error);
    }
}

// Make applyMobilePreset available globally
window.applyMobilePreset = applyMobilePreset;

// Setup BroadcastChannel listener for effects updates from other devices
function setupEffectsBroadcastListener() {
    effectsBroadcast.onmessage = (event) => {
        const msg = event.data;
        
        // Only process EFFECTS_UPDATE messages
        if (msg.type === 'EFFECTS_UPDATE' && msg.effects) {
            // Update local state and UI
            currentEffects = msg.effects;
            updateMobileEffectsUI(currentEffects);
            renderMobilePresets(effectsPresets, currentEffects.preset);
        }
    };
}

// Connect to SSE stream for real-time mobile status updates
function connectMobileStatusSSE() {
    if (mobileStatusEventSource) {
        mobileStatusEventSource.close();
    }
    
    if (!isAuthenticated || !mobileToken || !deviceFingerprint) return;
    
    // Build SSE URL with token and fingerprint for mobile authentication
    // Note: EventSource doesn't support custom headers, so we use query params
    const sseUrl = `/api/mobile/status/stream?token=${encodeURIComponent(mobileToken)}&fingerprint=${encodeURIComponent(deviceFingerprint)}`;
    mobileStatusEventSource = new EventSource(sseUrl);
    
    mobileStatusEventSource.onopen = () => {
        console.log('Mobile status SSE connection opened');
    };
    
    mobileStatusEventSource.onerror = () => {
        console.error('Mobile status SSE connection error');
        
        // Try to reconnect after 3 seconds
        setTimeout(() => {
            if (mobileStatusEventSource && mobileStatusEventSource.readyState === EventSource.CLOSED) {
                connectMobileStatusSSE();
            }
        }, 3000);
    };
    
    mobileStatusEventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            updateMobileUI(data);
        } catch (e) {
            console.error('Failed to parse mobile status SSE data:', e);
        }
    };
    
    mobileStatusEventSource.addEventListener('connected', () => {
        console.log('Mobile status SSE connected');
    });
}

// Connect to SSE stream for cross-device effects updates
function connectEffectsSSE() {
    if (effectsEventSource) {
        effectsEventSource.close();
    }
    
    if (!isAuthenticated || !mobileToken || !deviceFingerprint) return;
    
    // Build SSE URL with token and fingerprint for mobile authentication
    // Note: EventSource doesn't support custom headers, so we use query params
    const sseUrl = `/api/effects/stream?token=${encodeURIComponent(mobileToken)}&fingerprint=${encodeURIComponent(deviceFingerprint)}`;
    effectsEventSource = new EventSource(sseUrl);
    
    effectsEventSource.onopen = () => {
        console.log('Effects SSE connection opened');
    };
    
    effectsEventSource.onerror = () => {
        console.error('Effects SSE connection error');
        
        // Try to reconnect after 3 seconds
        setTimeout(() => {
            if (effectsEventSource && effectsEventSource.readyState === EventSource.CLOSED) {
                connectEffectsSSE();
            }
        }, 3000);
    };
    
    effectsEventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'EFFECTS_UPDATE' && data.effects) {
                // Update local state and UI
                currentEffects = data.effects;
                if (data.presets && data.presets.length > 0) {
                    effectsPresets = data.presets;
                }
                updateMobileEffectsUI(currentEffects);
                renderMobilePresets(effectsPresets, currentEffects.preset);
                
                // Also broadcast to same-browser tabs via BroadcastChannel
                effectsBroadcast.postMessage({ type: 'EFFECTS_UPDATE', effects: currentEffects });
            }
        } catch (e) {
            console.error('Failed to parse effects SSE data:', e);
        }
    };
    
    effectsEventSource.addEventListener('connected', () => {
        console.log('Effects SSE connected');
    });
}

// Setup effects controls
function setupEffectsControls() {
    // Speed slider
    const speedSlider = document.getElementById('mobile-effect-speed');
    if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            const valueEl = document.getElementById('mobile-speed-value');
            if (valueEl) valueEl.textContent = `${value.toFixed(2)}x`;
            debounceUpdateEffects({ speed: value });
        });
    }
    
    // EQ sliders
    ['bass', 'mid', 'treble'].forEach(band => {
        const slider = document.getElementById(`mobile-effect-eq-${band}`);
        if (slider) {
            slider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                const valueEl = document.getElementById(`mobile-eq-${band}-value`);
                if (valueEl) valueEl.textContent = value;
                debounceUpdateEffects({
                    eq: {
                        ...(currentEffects?.eq || {}),
                        [band]: value
                    }
                });
            });
        }
    });
    
    // Effect toggles
    ['reverb', 'echo', 'distortion', 'compressor'].forEach(effect => {
        const toggle = document.getElementById(`mobile-effect-${effect}-enabled`);
        if (toggle) {
            toggle.addEventListener('change', (e) => {
                debounceUpdateEffects({
                    [effect]: {
                        ...(currentEffects?.[effect] || {}),
                        enabled: e.target.checked
                    }
                });
            });
        }
    });
}

// Debounce effects updates
let effectsUpdateTimeout = null;
function debounceUpdateEffects(partialEffects) {
    if (effectsUpdateTimeout) {
        clearTimeout(effectsUpdateTimeout);
    }
    
    effectsUpdateTimeout = setTimeout(() => {
        if (!isAuthenticated || !mobileToken || !currentEffects) return;
        
        const updatedEffects = {
            ...currentEffects,
            ...partialEffects
        };
        
        updateMobileEffects(updatedEffects);
    }, 300);
}

// Update mobile effects on server
async function updateMobileEffects(newEffects) {
    if (!isAuthenticated || !mobileToken) return;
    
    try {
        const response = await fetch(`/api/mobile/effects?token=${mobileToken}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-Fingerprint': deviceFingerprint
            },
            body: JSON.stringify(newEffects)
        });
        
        if (response.ok) {
            const data = await response.json();
            currentEffects = data.effects;
            updateMobileEffectsUI(currentEffects);
            renderMobilePresets(effectsPresets, currentEffects.preset);
            // Broadcast update to sync with other devices/tabs
            effectsBroadcast.postMessage({ type: 'EFFECTS_UPDATE', effects: currentEffects });
        }
    } catch (error) {
        console.error('Error updating mobile effects:', error);
    }
}

// Prevent page dragging on mobile
function preventPageDrag() {
    let touchStartY = 0;
    let touchStartX = 0;
    
    // Prevent horizontal dragging and overscroll
    document.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        
        // Prevent multi-touch gestures
        if (e.touches.length > 1) {
            e.preventDefault();
        }
    }, { passive: true });
    
    // Prevent horizontal page dragging while allowing vertical scrolling
    document.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);
        
        // If horizontal movement is greater than vertical, prevent it
        // This allows vertical scrolling but prevents horizontal dragging
        if (deltaX > deltaY && deltaX > 10) {
            e.preventDefault();
        }
        
        // Prevent overscroll bounce effect
        const target = e.target;
        const scrollable = target.closest('.mobile-queue-container');
        const container = target.closest('.mobile-container');
        
        // If we're at the top or bottom of a scrollable container, prevent overscroll
        if (scrollable) {
            const { scrollTop, scrollHeight, clientHeight } = scrollable;
            const isAtTop = scrollTop === 0;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
            
            if ((isAtTop && touch.clientY > touchStartY) || 
                (isAtBottom && touch.clientY < touchStartY)) {
                // Allow normal scrolling, but prevent overscroll bounce
                return;
            }
        }
        
        // Prevent dragging on non-scrollable areas
        if (!scrollable && !container) {
            e.preventDefault();
        }
    }, { passive: false });
    
    // Prevent double-tap zoom
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });
}

// Update all static UI text based on current language
async function updateUIText() {
    // Wait for i18n to be ready
    if (!window.i18n) {
        setTimeout(updateUIText, 100);
        return;
    }
    
    // Update static text elements
    const authMessage = document.getElementById('auth-message');
    if (authMessage && !isAuthenticated) {
        authMessage.textContent = await window.i18n.t('ui.mobile.authenticating');
    }
    
    const authTitle = document.querySelector('#auth-screen h2');
    if (authTitle) {
        authTitle.textContent = await window.i18n.t('ui.mobile.wabisabyMobile');
    }
    
    // Update section headers (only if interface is visible)
    const nowPlayingHeader = document.querySelector('#mobile-now-playing .mobile-card-header h2');
    if (nowPlayingHeader) {
        nowPlayingHeader.textContent = window.i18n.tSync('ui.mobile.nowPlaying');
    }
    
    const queueHeader = document.querySelector('#mobile-queue .mobile-card-header h2');
    if (queueHeader) {
        queueHeader.textContent = window.i18n.tSync('ui.mobile.queue');
    }
    
    const effectsHeader = document.querySelector('#mobile-effects .mobile-card-header h2');
    if (effectsHeader) {
        effectsHeader.textContent = window.i18n.tSync('ui.mobile.effects');
    }
    
    // Update effects labels
    const speedLabel = document.querySelector('#mobile-effect-speed')?.parentElement?.querySelector('.mobile-effect-label span');
    if (speedLabel) {
        const icon = speedLabel.previousElementSibling;
        speedLabel.textContent = window.i18n.tSync('ui.mobile.speed');
    }
    
    const eqLabels = document.querySelectorAll('.mobile-effect-label span');
    eqLabels.forEach(label => {
        if (label.textContent === 'Equalizer') {
            label.textContent = window.i18n.tSync('ui.mobile.equalizer');
        }
    });
    
    // Update EQ band labels
    const bassLabel = document.querySelector('.mobile-eq-band label');
    if (bassLabel && bassLabel.textContent === 'Bass') {
        bassLabel.textContent = window.i18n.tSync('ui.mobile.bass');
    }
    const midLabels = document.querySelectorAll('.mobile-eq-band label');
    midLabels.forEach((label, index) => {
        if (label.textContent === 'Mid' && index === 1) {
            label.textContent = window.i18n.tSync('ui.mobile.mid');
        } else if (label.textContent === 'Treble' && index === 2) {
            label.textContent = window.i18n.tSync('ui.mobile.treble');
        }
    });
    
    // Update "More Controls" button
    const moreControlsBtn = document.querySelector('#mobile-effects-expand-btn span');
    if (moreControlsBtn) {
        moreControlsBtn.textContent = window.i18n.tSync('ui.mobile.moreControls');
    }
}

// Listen for language changes
window.addEventListener('languageChanged', () => {
    updateUIText();
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    preventPageDrag();
    // Wait for i18n to initialize
    await window.i18n.init();
    updateUIText();
    authenticate();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (mobileStatusEventSource) {
        mobileStatusEventSource.close();
        mobileStatusEventSource = null;
    }
    if (effectsEventSource) {
        effectsEventSource.close();
        effectsEventSource = null;
    }
});

