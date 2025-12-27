// ============================================
// STATE & CONFIG
// ============================================

const CONFIG = {
    AUDIO_STALE_MS: 500,
    LERP_SPEED: 0.2,
    LERP_SPEED_DOWN: 0.1,
    INTENSITY_DECAY: 0.95,
    BAR_COUNT: 64,           // Number of bars
    BAR_SPACING: 2,          // Spacing between bars
    BAR_MAX_HEIGHT: 150,     // Max height of bars
};

// State
let currentLyrics = null;
let currentLineIndex = -1;
let lastFetchedTitle = null;
let currentSongDuration = null;
let currentSongData = null;
let hasLyrics = false;
let showLyricsMode = false;
let showRequesterNameEnabled = true; // Default to true
let lyricsOffset = 0; // Manual offset in seconds
let isScrubbingLyrics = false; // To pause auto-scroll while interacting
let lastScrollTarget = null; // Track last scroll target to prevent unnecessary updates
let scrollAnimationFrame = null; // Track animation frame to prevent overlapping calls

// Audio visualization state
let audioDataArray = null;
let lastAudioDataTime = 0;
let bassIntensity = 0;
let smoothBassIntensity = 0;

// Bar heights for smooth animation
const barHeights = new Array(CONFIG.BAR_COUNT).fill(0);

// Animation
let animationFrame = null;

// DOM elements
const elements = {
    bgBlur: document.getElementById('bg-blur'),
    waveCanvas: document.getElementById('wave-canvas'),
    shadowCanvas: document.getElementById('shadow-canvas'),
    albumArt: document.getElementById('album-art'),
    albumImg: document.getElementById('album-img'),
    albumPlaceholder: document.getElementById('album-placeholder'),
    songTitle: document.getElementById('song-title'),
    songArtist: document.getElementById('song-artist'),
    songRequester: document.getElementById('song-requester'),
    progressBar: document.getElementById('progress-bar'),
    progressContainer: document.getElementById('progress-bar-container'),
    currentTime: document.getElementById('current-time'),
    totalTime: document.getElementById('total-time'),
    lyricsContainer: document.getElementById('lyrics-container'),
    btnLyrics: document.getElementById('btn-lyrics'),
    btnVisualizer: document.getElementById('btn-visualizer'),
    btnLyricsOffset: document.getElementById('btn-lyrics-offset'),
    dataIndicator: document.getElementById('data-indicator'),
    // Lyrics mode elements
    miniAlbumImg: document.getElementById('mini-album-img'),
    lyricsTitle: document.getElementById('lyrics-title'),
    lyricsArtist: document.getElementById('lyrics-artist'),
    lyricsProgressBar: document.getElementById('lyrics-progress-bar'),
    lyricsProgressContainer: document.getElementById('lyrics-progress-container'),
    lyricsCurrentTime: document.getElementById('lyrics-current-time'),
    lyricsTotalTime: document.getElementById('lyrics-total-time'),
    activeEffects: document.getElementById('active-effects'),
};

// Canvas contexts
const ctx = elements.waveCanvas.getContext('2d');
const shadowCtx = elements.shadowCanvas.getContext('2d');

// ============================================
// BROADCAST CHANNEL
// ============================================

const broadcast = new BroadcastChannel('wabisaby_audio_channel');

broadcast.onmessage = (event) => {
    const msg = event.data;

    switch (msg.type) {
        case 'SONG_UPDATE':
            updateSongInfo(msg.song);
            break;
        case 'PROGRESS_UPDATE':
            updateProgress(msg);
            if (msg.audioData) {
                audioDataArray = new Uint8Array(msg.audioData);
                lastAudioDataTime = performance.now();
            }
            break;
        case 'SONG_DATA':
            if (msg.song) {
                currentSongData = {
                    current: msg.song.current || 0,
                    total: msg.song.duration || 0
                };
            }
            break;
        case 'SETTINGS_UPDATE':
            if (msg.settings && msg.settings.playback && 'showRequesterName' in msg.settings.playback) {
                showRequesterNameEnabled = msg.settings.playback.showRequesterName;
                // Update current song display if there's a song
                if (currentSongData) {
                    // Trigger a refresh by requesting song update
                    if (window.opener) {
                        window.opener.postMessage({ type: 'REQUEST_SONG_UPDATE' }, '*');
                    }
                }
            }
            break;
            break;
        case 'AUDIO_DATA':
            if (msg.data) {
                audioDataArray = new Uint8Array(msg.data);
                lastAudioDataTime = performance.now();
            }
            break;
        case 'EFFECTS_UPDATE':
            if (msg.effects) {
                renderActiveEffects(msg.effects);
            }
            break;
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function lerp(current, target, speed) {
    return current + (target - current) * speed;
}

function formatTime(ms) {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ============================================
// MINI PLAYER TITLE SCROLLING
// ============================================

function checkTitleOverflow() {
    const titleElement = elements.lyricsTitle;
    if (!titleElement) return;

    // Ensure text is wrapped in scroll-text span
    let scrollText = titleElement.querySelector('.scroll-text');
    const textContent = titleElement.textContent || titleElement.innerText;

    if (!scrollText) {
        // Wrap existing text in span
        scrollText = document.createElement('span');
        scrollText.className = 'scroll-text';
        scrollText.textContent = textContent;
        titleElement.textContent = '';
        titleElement.appendChild(scrollText);
    } else {
        // Update text content if it changed
        if (scrollText.textContent !== textContent) {
            scrollText.textContent = textContent;
        }
    }

    // Temporarily remove scrolling class to measure
    titleElement.classList.remove('scrolling');

    // Force a reflow to get accurate measurements
    void titleElement.offsetWidth;

    // Get container width (mini-player-info)
    const container = titleElement.parentElement;
    if (!container) return;

    const containerWidth = container.offsetWidth;

    // Measure the scroll-text span width
    const textWidth = scrollText.offsetWidth;

    // Check if text overflows
    if (textWidth > containerWidth) {
        // Calculate scroll distance to show all text
        // The overflow amount is how much we need to scroll left to show the end
        const overflow = textWidth - containerWidth;
        // Album art width (42px) + gap (16px) = 58px
        // Scroll left by overflow to show end, plus enough to go behind album art
        const scrollDistance = -(overflow + 58 + 10); // Negative to scroll left, +10px buffer
        titleElement.style.setProperty('--scroll-distance', `${scrollDistance}px`);

        // Calculate animation duration based on scroll distance
        const baseDuration = 8; // base seconds
        const totalScroll = Math.abs(scrollDistance);
        const extraDuration = Math.max(0, totalScroll / 40); // 40px per second for extra distance
        const duration = baseDuration + extraDuration;
        titleElement.style.setProperty('--scroll-duration', `${duration}s`);

        titleElement.classList.add('scrolling');
    } else {
        titleElement.classList.remove('scrolling');
        titleElement.style.removeProperty('--scroll-distance');
        titleElement.style.removeProperty('--scroll-duration');
    }
}

// ============================================
// BAR VISUALIZER
// ============================================

// ============================================
// EFFECTS DISPLAY
// ============================================

async function fetchEffects() {
    try {
        const response = await fetch('/api/effects');
        if (response.ok) {
            const data = await response.json();
            if (data.effects) {
                renderActiveEffects(data.effects);
            }
        }
    } catch (err) {
        console.error('Failed to load initial effects:', err);
    }
}

function renderActiveEffects(effects) {
    if (!elements.activeEffects) return;

    // If master toggle is off, show nothing
    if (!effects.enabled) {
        elements.activeEffects.innerHTML = '';
        return;
    }

    const badges = [];

    // Speed
    if (effects.speed && effects.speed !== 1.0) {
        badges.push({
            icon: 'fa-tachometer-alt',
            text: `${effects.speed}x`,
            class: 'speed'
        });
    }

    // EQ (Check if any band is active)
    const eq = effects.eq || {};
    if (eq.bass || eq.mid || eq.treble) {
        const bands = [];
        if (eq.bass) bands.push('Bass');
        if (eq.mid) bands.push('Mid');
        if (eq.treble) bands.push('Treble');

        // Simplified EQ badge
        badges.push({
            icon: 'fa-sliders-h',
            text: 'EQ' // Keep it simple to avoid clutter
        });
    }

    // Reverb
    if (effects.reverb && effects.reverb.enabled) {
        badges.push({
            icon: 'fa-dungeon',
            text: 'Reverb'
        });
    }

    // Echo
    if (effects.echo && effects.echo.enabled) {
        badges.push({
            icon: 'fa-bullhorn',
            text: 'Echo'
        });
    }

    // Distortion
    if (effects.distortion && effects.distortion.enabled) {
        badges.push({
            icon: 'fa-bolt',
            text: 'Distortion'
        });
    }

    // Compressor
    if (effects.compressor && effects.compressor.enabled) {
        badges.push({
            icon: 'fa-compress-arrows-alt',
            text: 'Comp'
        });
    }

    // Render
    elements.activeEffects.innerHTML = badges.map(badge => `
        <div class="effect-badge ${badge.class || ''}">
            <i class="fas ${badge.icon}"></i>
            <span>${badge.text}</span>
        </div>
    `).join('');
}

// Initial fetch
fetchEffects();

function drawVisualizer() {
    animationFrame = requestAnimationFrame(drawVisualizer);

    // Handle canvas resize
    const canvas = elements.waveCanvas;
    const shadowCanvas = elements.shadowCanvas;
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    if (shadowCanvas.width !== window.innerWidth || shadowCanvas.height !== window.innerHeight) {
        shadowCanvas.width = window.innerWidth;
        shadowCanvas.height = window.innerHeight;
    }

    const width = canvas.width;
    const height = canvas.height;
    const shadowHeight = shadowCanvas.height;
    const time = Date.now() / 1000;

    const now = performance.now();
    const dataAge = now - lastAudioDataTime;
    const hasAudio = audioDataArray && dataAge < CONFIG.AUDIO_STALE_MS;
    const hasFreshAudio = audioDataArray && dataAge < 200;

    // Update data indicator
    if (elements.dataIndicator) {
        if (hasFreshAudio) {
            elements.dataIndicator.className = 'data-indicator live';
            elements.dataIndicator.title = 'Receiving live audio';
        } else if (hasAudio) {
            elements.dataIndicator.className = 'data-indicator stale';
            elements.dataIndicator.title = `Data ${Math.round(dataAge)}ms old`;
        } else {
            elements.dataIndicator.className = 'data-indicator';
            elements.dataIndicator.title = 'No audio data';
        }
    }

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Process audio data for bass intensity
    let bassAvg = 0;

    if (hasAudio && audioDataArray.length > 0) {
        const bassEnd = Math.floor(audioDataArray.length * 0.15);
        for (let i = 0; i < bassEnd; i++) {
            bassAvg += audioDataArray[i] / 255;
        }
        bassAvg /= bassEnd;

        bassIntensity = bassAvg;
        smoothBassIntensity = lerp(smoothBassIntensity, bassAvg, 0.3);
    } else {
        bassIntensity *= CONFIG.INTENSITY_DECAY;
        smoothBassIntensity *= CONFIG.INTENSITY_DECAY;
    }

    // Canvas opacity is now handled by CSS transitions for smoother animations
    ctx.globalAlpha = 1.0;
    shadowCtx.globalAlpha = 1.0;

    // Update Album Border Ring (Thin Animated Border)
    const borderGlow = 0.3 + smoothBassIntensity * 0.7;
    const borderWidth = 2 + smoothBassIntensity * 2;
    const scale = 1 + smoothBassIntensity * 0.02;

    elements.albumArt.style.boxShadow = `
                0 0 0 ${borderWidth}px rgba(52, 211, 153, ${borderGlow}),
                0 10px 30px -5px rgba(0, 0, 0, 0.4)
            `;
    elements.albumArt.style.transform = `scale(${scale})`;

    // Draw symmetric bars from center (flipped: outer bars in center, center bars on edges)
    const totalBarWidth = (width / CONFIG.BAR_COUNT) / 2; // Width for half the bars
    // Actually, let's just use fixed width calculation
    const centerX = width / 2;
    const barWidth = (width / CONFIG.BAR_COUNT) - CONFIG.BAR_SPACING;
    const halfBarCount = CONFIG.BAR_COUNT / 2;

    // Draw from center outwards (flipped)
    // We need half the bars on left, half on right
    // Let's use the full BAR_COUNT but mirror them

    for (let i = 0; i < halfBarCount; i++) {
        // Reverse the index: outermost bars (high i) go to center, center bars (low i) go to edges
        const reversedI = halfBarCount - 1 - i;

        let targetHeight = 0;

        // Use standard visualizer if: 1. We have audio AND 2. We are NOT in lyrics mode
        if (hasAudio && audioDataArray.length > 0 && !showLyricsMode) {
            // Map frequency to bar index (now high freqs at center due to reversal)
            const indexRatio = reversedI / halfBarCount;
            // Logarithmic scale
            const freqIndex = Math.floor(Math.pow(indexRatio, 1.5) * audioDataArray.length * 0.6);

            // Average window
            const window = 2;
            let sum = 0;
            for (let w = 0; w < window; w++) {
                const idx = Math.min(freqIndex + w, audioDataArray.length - 1);
                sum += audioDataArray[idx];
            }
            const val = (sum / window) / 255;

            targetHeight = val * height; // Scale to canvas height
        } else {
            // Idle Animation OR Lyrics Mode Reactive Animation
            const offset = reversedI * 0.2;
            let val = Math.sin(time * 2 + offset) * 0.2 + 0.2;

            // If in lyrics mode with audio, add reactivity!
            if (showLyricsMode && hasAudio) {
                val *= (1 + smoothBassIntensity * 1.5); // Pulse with the beat
            }

            targetHeight = val * 50 + 10;
        }
        // Smooth animation (use original i for barHeights array indexing)
        const lerpSpeed = targetHeight > barHeights[i] ? CONFIG.LERP_SPEED : CONFIG.LERP_SPEED_DOWN;
        barHeights[i] = lerp(barHeights[i], targetHeight, lerpSpeed);

        const h = barHeights[i];

        // Calculate positions for mirrored bars (positions stay the same, but data is flipped)
        // Left side (growing leftwards from center)
        const xLeft = centerX - (i + 1) * (barWidth + CONFIG.BAR_SPACING);
        // Right side (growing rightwards from center)
        const xRight = centerX + i * (barWidth + CONFIG.BAR_SPACING) + CONFIG.BAR_SPACING;

        const y = height - h;

        // Draw bar gradient
        const gradient = ctx.createLinearGradient(0, height, 0, height - h);
        gradient.addColorStop(0, 'rgba(52, 211, 153, 0.9)');
        gradient.addColorStop(1, 'rgba(52, 211, 153, 0.1)');

        ctx.fillStyle = gradient;

        // Enable shadow for bars
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(52, 211, 153, 0.4)';
        ctx.shadowOffsetY = -2;

        // Draw Left Bar
        ctx.beginPath();
        ctx.roundRect(xLeft, y, barWidth, h + 10, 12);
        ctx.fill();

        // Draw Right Bar
        ctx.beginPath();
        ctx.roundRect(xRight, y, barWidth, h + 10, 12);
        ctx.fill();

        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
    }

    // Draw shadows on the top shadow canvas
    shadowCtx.clearRect(0, 0, shadowCanvas.width, shadowHeight);

    for (let i = 0; i < halfBarCount; i++) {
        const h = barHeights[i];
        const xLeft = centerX - (i + 1) * (barWidth + CONFIG.BAR_SPACING);
        const xRight = centerX + i * (barWidth + CONFIG.BAR_SPACING) + CONFIG.BAR_SPACING;

        // Draw shadow/reflection at the top of the screen
        const shadowBarHeight = Math.min(h * 0.4, shadowHeight * 0.8); // Max 80% of shadow canvas height
        const shadowOpacity = Math.min(h / 150, 0.5); // Scale opacity with bar height
        const shadowGradient = shadowCtx.createLinearGradient(0, 0, 0, shadowBarHeight);
        shadowGradient.addColorStop(0, `rgba(52, 211, 153, 0)`);
        shadowGradient.addColorStop(0.5, `rgba(52, 211, 153, ${shadowOpacity * 0.5})`);
        shadowGradient.addColorStop(1, `rgba(52, 211, 153, ${shadowOpacity})`);

        shadowCtx.fillStyle = shadowGradient;

        // Draw top shadow for Left Bar at top of shadow canvas
        shadowCtx.beginPath();
        shadowCtx.roundRect(xLeft, 0, barWidth, shadowBarHeight, 12);
        shadowCtx.fill();

        // Draw top shadow for Right Bar at top of shadow canvas
        shadowCtx.beginPath();
        shadowCtx.roundRect(xRight, 0, barWidth, shadowBarHeight, 12);
        shadowCtx.fill();
    }
    // Reset global alpha after drawing
    ctx.globalAlpha = 1.0;
    shadowCtx.globalAlpha = 1.0;
}

// Remove drawWave and drawAmbientWave functions as they are no longer used

// ============================================
// SONG INFO & LYRICS
// ============================================

function showIdleState() {
    document.body.classList.add('idle-state');
    elements.songTitle.textContent = 'Waiting for music...';
    elements.songArtist.textContent = 'Add songs to the queue!';
    elements.songRequester.innerHTML = '';

    elements.albumImg.classList.remove('visible');
    elements.albumPlaceholder.style.display = 'flex';

    elements.bgBlur.classList.remove('active');
    elements.bgBlur.style.backgroundImage = '';

    // Reset state
    lastFetchedTitle = null;
    currentLyrics = null;
    hasLyrics = false;

    // specific disable
    elements.btnLyrics.disabled = true;
    if (elements.btnLyrics.parentElement) elements.btnLyrics.parentElement.classList.add('disabled');

    // Hide offset button when no lyrics
    updateOffsetButtonVisibility();
}

async function fetchLyrics(title, artist = '', durationMs = null) {
    const durationSec = durationMs ? Math.round(durationMs / 1000) : null;
    updateLyrics(null);

    try {
        let url = `/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
        if (durationSec) url += `&duration=${durationSec}`;

        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            updateLyrics(data);
        } else {
            updateLyrics({ notFound: true });
        }
    } catch (e) {
        updateLyrics({ notFound: true });
    }
}

function updateSongInfo(song) {
    if (!song) {
        showIdleState();
        return;
    }

    document.body.classList.remove('idle-state');

    if (song.duration) {
        currentSongData = { current: song.elapsed || 0, total: song.duration };
    }

    const rawTitle = song.title || song.content || 'Unknown Title';
    let displayTitle = rawTitle;
    let displayArtist = song.artist || '';

    if (!displayArtist) {
        const separators = [' - ', ' – ', ' : ', ' by '];
        for (const sep of separators) {
            if (rawTitle.includes(sep)) {
                const parts = rawTitle.split(sep);
                if (sep === ' by ') {
                    displayTitle = parts[0];
                    displayArtist = parts[1];
                } else {
                    displayArtist = parts[0];
                    displayTitle = parts.slice(1).join(sep);
                }
                break;
            }
        }
    }

    displayTitle = displayTitle
        .replace(/\(Official Video\)/gi, '')
        .replace(/\(Official Audio\)/gi, '')
        .replace(/\(Lyrics\)/gi, '')
        .trim();
    displayArtist = displayArtist.trim();

    if (song.duration) currentSongDuration = song.duration;

    if (rawTitle && rawTitle !== lastFetchedTitle) {
        lastFetchedTitle = rawTitle;
        fetchLyrics(displayTitle, displayArtist, currentSongDuration);
    }

    // Update displays
    elements.songTitle.textContent = displayTitle;
    elements.lyricsTitle.textContent = displayTitle;

    // Check if title needs scrolling (use setTimeout to ensure DOM is updated)
    setTimeout(() => {
        checkTitleOverflow();
    }, 0);

    if (displayArtist) {
        elements.songArtist.textContent = displayArtist;
        elements.songArtist.style.display = 'block';
        elements.lyricsArtist.textContent = displayArtist;
        document.title = `${displayTitle} • ${displayArtist}`;
    } else {
        elements.songArtist.style.display = 'none';
        elements.lyricsArtist.textContent = '';
        document.title = displayTitle;
    }

    const requester = song.requester || 'Unknown';
    if (showRequesterNameEnabled) {
        elements.songRequester.innerHTML = `<i class="fas fa-user-circle"></i> <span>Requested by ${requester}</span>`;
        elements.songRequester.style.display = 'block';
    } else {
        elements.songRequester.style.display = 'none';
    }

    // Update album art
    if (song.thumbnailUrl) {
        if (elements.albumImg.src !== song.thumbnailUrl) {
            elements.albumImg.src = song.thumbnailUrl;
            elements.miniAlbumImg.src = song.thumbnailUrl;
            elements.albumImg.onload = () => {
                elements.albumImg.classList.add('visible');
                elements.albumPlaceholder.style.display = 'none';

                // Set blurred background
                elements.bgBlur.style.backgroundImage = `url(${song.thumbnailUrl})`;
                elements.bgBlur.classList.add('active');
            };
        }
    } else {
        elements.albumImg.classList.remove('visible');
        elements.albumPlaceholder.style.display = 'flex';
        elements.bgBlur.classList.remove('active');
    }
}

function adjustLyricsOffset(amount) {
    lyricsOffset += amount;
    // Show toast or temporary indicator if needed, for now just update visual
    const display = document.getElementById('sync-offset-display');
    if (display) {
        const sign = lyricsOffset > 0 ? '+' : '';
        display.textContent = `${sign}${lyricsOffset.toFixed(1)}s`;
    }

    // Force re-check of current line
    if (currentSongData && currentSongData.current) {
        // Pass a dummy object to trigger line check without full UI update if desired, 
        // but easier to just wait for next progress update or trigger one.
        // We'll let the next progress event handle it naturally.
    }
    broadcast.postMessage({ type: 'LYRICS_OFFSET', offset: lyricsOffset });
}

function updateLyrics(data) {
    currentLyrics = null;
    currentLineIndex = -1;
    lyricsOffset = 0; // Reset offset on new song

    // Update song info from lyrics API if available
    if (data && !data.notFound && data.trackName && data.artistName) {
        elements.songTitle.textContent = data.trackName;
        elements.songArtist.textContent = data.artistName;
        elements.songArtist.style.display = 'block';
        elements.lyricsTitle.textContent = data.trackName;
        elements.lyricsArtist.textContent = data.artistName;
        document.title = `${data.trackName} • ${data.artistName}`;

        // Check if title needs scrolling
        setTimeout(() => {
            checkTitleOverflow();
        }, 0);
    }

    if (!data) {
        hasLyrics = false;
        elements.btnLyrics.disabled = true;
        if (elements.btnLyrics.parentElement) elements.btnLyrics.parentElement.classList.add('disabled');
        renderLyrics(null, 'Loading lyrics...');
        updateOffsetButtonVisibility();
        return;
    }

    if (data.notFound || !data.syncedLyrics || data.syncedLyrics.length === 0) {
        hasLyrics = false;
        elements.btnLyrics.disabled = true;
        if (elements.btnLyrics.parentElement) elements.btnLyrics.parentElement.classList.add('disabled');
        renderLyrics(null);

        // Switch to visualizer if in lyrics mode
        if (showLyricsMode) {
            setVisualizerMode();
        }
        updateOffsetButtonVisibility();
        return;
    }

    hasLyrics = true;
    currentLyrics = data.syncedLyrics;
    elements.btnLyrics.disabled = false;
    if (elements.btnLyrics.parentElement) elements.btnLyrics.parentElement.classList.remove('disabled');
    renderLyrics(currentLyrics);
    updateOffsetButtonVisibility();
}

function renderLyrics(lyrics, statusMsg = null) {
    const container = elements.lyricsContainer;
    container.innerHTML = '';
    container.style.transform = 'translateY(0)';

    if (!lyrics) {
        const placeholder = document.createElement('div');
        placeholder.className = 'lyrics-placeholder';

        if (statusMsg) {
            placeholder.innerHTML = `
                        <i class="fas fa-circle-notch fa-spin"></i>
                        <p>${statusMsg}</p>`;
        } else {
            placeholder.innerHTML = `
                        <i class="fas fa-microphone-slash"></i>
                        <p>No lyrics available</p>`;
        }

        container.appendChild(placeholder);
        return;
    }

    // Add top spacer for better centering (additional to CSS padding)
    const topSpacer = document.createElement('div');
    topSpacer.className = 'lyrics-spacer';
    topSpacer.style.height = '60px'; // Additional top spacing
    container.appendChild(topSpacer);

    // Add lyrics lines
    lyrics.forEach((line, index) => {
        const div = document.createElement('div');
        div.className = 'lyric-line';
        div.textContent = line.text || '♪';
        div.dataset.index = index;
        div.dataset.time = line.time;

        div.onclick = () => {
            const timeInMs = line.time * 1000;
            if (window.opener) {
                window.opener.postMessage({ type: 'SEEK_REQUEST', time: timeInMs }, '*');
            }
            broadcast.postMessage({ type: 'SEEK_REQUEST', time: timeInMs });
        };

        container.appendChild(div);
    });
    
    // Ensure proper spacing - add a small delay to let CSS transitions work
    setTimeout(() => {
        const lines = container.querySelectorAll('.lyric-line');
        lines.forEach((line, i) => {
            // Add smooth transitions for size changes
            line.style.transition = 'font-size 0.5s cubic-bezier(0.33, 1, 0.68, 1), opacity 0.5s cubic-bezier(0.33, 1, 0.68, 1), color 0.5s cubic-bezier(0.33, 1, 0.68, 1)';
        });
    }, 50);

    // Add bottom spacer for better centering
    const bottomSpacer = document.createElement('div');
    bottomSpacer.className = 'lyrics-spacer';
    bottomSpacer.style.height = '60px'; // Additional bottom spacing
    container.appendChild(bottomSpacer);

    // Add Sync Controls
    const controls = document.createElement('div');
    controls.className = 'lyrics-controls';
    controls.innerHTML = `
                <div class="sync-btn" onclick="adjustLyricsOffset(-0.5)" title="Earlier (-0.5s)">
                    <i class="fas fa-minus"></i>
                </div>
                <div class="sync-display" id="sync-offset-display">
                    0.0s
                </div>
                <div class="sync-btn" onclick="adjustLyricsOffset(0.5)" title="Later (+0.5s)">
                    <i class="fas fa-plus"></i>
                </div>
            `;
    elements.lyricsContainer.appendChild(controls);

    // Make helper global so HTML onclick works
    window.adjustLyricsOffset = adjustLyricsOffset;

    // Reset scroll target tracking when lyrics are re-rendered
    lastScrollTarget = null;
    
    // If at song start (no active line yet), position first line at center
    if (currentLineIndex < 0) {
        setTimeout(() => scrollToLyricLine(-1, true), 100);
    } else {
        // If we already have an active line, scroll to it
        setTimeout(() => scrollToLyricLine(currentLineIndex, true), 100);
    }
}

function updateProgress(data) {
    if (data.total) {
        currentSongData = { current: data.current, total: data.total };
    }

    if (!currentSongDuration) currentSongDuration = data.total;

    // Update both progress bars
    const progress = `${data.progress}%`;
    elements.progressBar.style.width = progress;
    elements.lyricsProgressBar.style.width = progress;

    const currentFormatted = formatTime(data.current);
    const totalFormatted = formatTime(data.total);

    elements.currentTime.textContent = currentFormatted;
    elements.totalTime.textContent = totalFormatted;
    elements.lyricsCurrentTime.textContent = currentFormatted;
    elements.lyricsTotalTime.textContent = totalFormatted;

    // Update lyrics position
    if (currentLyrics && currentLyrics.length > 0) {
        // Apply manual offset
        const currentTimeSec = (data.current / 1000) + lyricsOffset;

        let activeIndex = -1;
        
        // Find the active line - the last line whose time we've passed
        for (let i = 0; i < currentLyrics.length; i++) {
            if (currentTimeSec >= currentLyrics[i].time) {
                activeIndex = i;
            } else {
                break;
            }
        }
        
        // If we're between lines (closer to next line than current), show next line
        // This makes transitions smoother and more responsive
        if (activeIndex >= 0 && activeIndex < currentLyrics.length - 1) {
            const currentLineTime = currentLyrics[activeIndex].time;
            const nextLineTime = currentLyrics[activeIndex + 1].time;
            const timeUntilNext = nextLineTime - currentTimeSec;
            const timeSinceCurrent = currentTimeSec - currentLineTime;
            
            // If we're closer to the next line (within 0.3s), show it instead
            // This creates a smoother "preview" effect like Spotify
            if (timeUntilNext < 0.3 && timeUntilNext < timeSinceCurrent) {
                activeIndex = activeIndex + 1;
            }
        }

        // Update highlighting and scrolling
        const indexChanged = activeIndex !== currentLineIndex;
        if (indexChanged) {
            currentLineIndex = activeIndex;
            highlightLyricLine(activeIndex);
        }
        
        // Scroll to keep active line centered, but only when index changes
        // This prevents constant scrolling and snapping
        if (activeIndex >= 0 && showLyricsMode && indexChanged) {
            scrollToLyricLine(activeIndex, false);
        }
    }
}

function highlightLyricLine(index) {
    const lines = document.querySelectorAll('.lyric-line');
    lines.forEach((line, i) => {
        line.classList.remove('active', 'past', 'next');
        if (i === index) {
            line.classList.add('active');
        } else if (i < index) {
            line.classList.add('past');
        } else if (i === index + 1) {
            line.classList.add('next');
        }
    });
}

function scrollToLyricLine(index, forceUpdate = false) {
    if (isScrubbingLyrics) return;

    const lines = document.querySelectorAll('.lyric-line');
    if (lines.length === 0) return;

    // Handle index = -1 (before any line is active) by positioning first line at center
    const targetIndex = index < 0 ? 0 : index;
    if (targetIndex >= lines.length) return;

    // Cancel any pending scroll animation to prevent overlapping calls
    if (scrollAnimationFrame) {
        cancelAnimationFrame(scrollAnimationFrame);
        scrollAnimationFrame = null;
    }

    const line = lines[targetIndex];
    const container = elements.lyricsContainer;
    const stage = document.querySelector('.lyrics-stage');

    if (!stage || !line || !container) {
        console.warn('scrollToLyricLine: Missing elements', { stage: !!stage, line: !!line, container: !!container });
        return;
    }

    // Use requestAnimationFrame to ensure layout is complete
    scrollAnimationFrame = requestAnimationFrame(() => {
        scrollAnimationFrame = requestAnimationFrame(() => {
            scrollAnimationFrame = null;
            
            // Force a layout recalculation to ensure accurate measurements
            void container.offsetHeight;
            void stage.offsetHeight;
            void line.offsetHeight;

            // Get the line's position relative to the container
            const lineTop = line.offsetTop;
            const lineHeight = line.offsetHeight;
            const stageHeight = stage.offsetHeight;
            
            // Calculate how much we need to move the container to center the line
            const lineCenter = lineTop + (lineHeight / 2);
            const stageCenter = stageHeight / 2;
            const targetY = lineCenter - stageCenter;

            // Get current transform value
            const computedStyle = window.getComputedStyle(container);
            const currentTransform = computedStyle.transform;
            let currentTransformY = 0;
            
            if (currentTransform && currentTransform !== 'none') {
                const matrix = currentTransform.match(/matrix\([^)]+\)/);
                if (matrix) {
                    const values = matrix[0].match(/-?\d+\.?\d*/g);
                    if (values && values.length >= 6) {
                        currentTransformY = parseFloat(values[5]); // translateY is the 6th value in matrix
                    }
                }
            }
            
            // Fallback to style.transform if computed style doesn't work
            if (currentTransformY === 0) {
                const styleTransform = container.style.transform || '';
                const match = styleTransform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
                if (match) {
                    currentTransformY = parseFloat(match[1]);
                }
            }
            
            const targetOffset = Math.round(targetY);
            const targetTransformY = -targetOffset; // Transform value is negative of offset
            
            // Calculate the difference
            const diff = Math.abs(currentTransformY - targetTransformY);
            
            // Only update if:
            // 1. Force update is requested, OR
            // 2. The target index changed, OR
            // 3. The position difference is significant (more than 2px)
            const indexChanged = lastScrollTarget !== targetIndex;
            const shouldUpdate = forceUpdate || indexChanged || diff > 2;
            
            if (shouldUpdate) {
                // Only set transition if we're not already animating to avoid interrupting
                // Check if there's an active transition by looking at computed transition property
                const hasActiveTransition = computedStyle.transition !== 'none' && 
                                           computedStyle.transition.includes('transform');
                
                // If we're jumping to a new line (index changed), use a smooth transition
                // If we're just fine-tuning position, use a shorter, smoother transition
                if (indexChanged || !hasActiveTransition) {
                    // Use a smoother easing function for better feel
                    container.style.transition = 'transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                } else if (diff > 10) {
                    // For larger adjustments, use a medium transition
                    container.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                } else {
                    // For small adjustments, use a quick, smooth transition
                    container.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                }
                
                // Apply the transform
                container.style.transform = `translateY(${targetTransformY}px)`;
                
                // Track the last target
                lastScrollTarget = targetIndex;
            }
        });
    });
}

// ============================================
// MODE SWITCHING
// ============================================

function setVisualizerMode() {
    document.body.classList.remove('lyrics-mode');
    document.body.classList.add('visualizer-mode');
    elements.btnVisualizer.classList.add('active');
    elements.btnLyrics.classList.remove('active');
    showLyricsMode = false;
    updateOffsetButtonVisibility();
}

function setLyricsMode() {
    if (!hasLyrics) return;

    document.body.classList.remove('visualizer-mode');
    document.body.classList.add('lyrics-mode');
    elements.btnLyrics.classList.add('active');
    elements.btnVisualizer.classList.remove('active');
    showLyricsMode = true;
    updateOffsetButtonVisibility();

    // Reset scroll target tracking when switching to lyrics mode
    lastScrollTarget = null;
    
    // Immediately scroll to current line (or first line if at song start)
    // Use a timeout to ensure DOM is ready
    setTimeout(() => {
        scrollToLyricLine(currentLineIndex >= 0 ? currentLineIndex : 0, true);
    }, 50);
}

elements.btnVisualizer.addEventListener('click', setVisualizerMode);
elements.btnLyrics.addEventListener('click', setLyricsMode);

const btnLyricsOffsetTrigger = document.getElementById('btn-lyrics-offset');
const splitWrapper = document.querySelector('.split-btn-wrapper');
const btnMinus = document.getElementById('btn-offset-minus');
const btnPlus = document.getElementById('btn-offset-plus');
const offsetValDisplay = document.getElementById('offset-display-val');

let revertTimeout = null;

function updateOffsetDisplay() {
    if (offsetValDisplay) {
        const sign = lyricsOffset > 0 ? '+' : '';
        offsetValDisplay.textContent = `${sign}${lyricsOffset.toFixed(1)}s`;
    }
}

function updateOffsetButtonVisibility() {
    if (elements.btnLyricsOffset) {
        // Only show offset button when lyrics are available AND lyrics mode is active
        if (hasLyrics && showLyricsMode) {
            elements.btnLyricsOffset.style.display = 'flex';
        } else {
            elements.btnLyricsOffset.style.display = 'none';
        }
    }
}

if (btnLyricsOffsetTrigger && splitWrapper) {
    // 1. Click Settings Icon -> Enter Adjusting Mode
    btnLyricsOffsetTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!hasLyrics) return;

        // Enter adjusting mode
        splitWrapper.classList.add('adjusting');
        updateOffsetDisplay();

        // Clear any pending timeout
        if (revertTimeout) clearTimeout(revertTimeout);
    });

    // 2. Click +/- Buttons
    if (btnMinus) {
        btnMinus.addEventListener('click', (e) => {
            e.stopPropagation();
            adjustLyricsOffset(-0.5);
            updateOffsetDisplay();

            // Interaction resets timeout
            if (revertTimeout) clearTimeout(revertTimeout);
        });
    }

    if (btnPlus) {
        btnPlus.addEventListener('click', (e) => {
            e.stopPropagation();
            adjustLyricsOffset(0.5);
            updateOffsetDisplay();

            // Interaction resets timeout
            if (revertTimeout) clearTimeout(revertTimeout);
        });
    }

    // 3. Mouse Leave -> Revert after delay
    splitWrapper.addEventListener('mouseleave', () => {
        if (splitWrapper.classList.contains('adjusting')) {
            revertTimeout = setTimeout(() => {
                splitWrapper.classList.remove('adjusting');
            }, 1000); // 1s delay before collapsing back to icon
        }
    });

    // 4. Mouse Enter -> Cancel revert if they come back
    splitWrapper.addEventListener('mouseenter', () => {
        if (revertTimeout) {
            clearTimeout(revertTimeout);
            revertTimeout = null;
        }
    });
}

// ============================================
// SEEK FUNCTIONALITY
// ============================================

function handleSeek(e, container) {
    if (!currentSongData || !currentSongData.total) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * currentSongData.total;

    if (window.opener) {
        window.opener.postMessage({ type: 'SEEK_REQUEST', time: newTime }, '*');
    }
    broadcast.postMessage({ type: 'SEEK_REQUEST', time: newTime });
}

elements.progressContainer.addEventListener('click', (e) => handleSeek(e, elements.progressContainer));
elements.lyricsProgressContainer.addEventListener('click', (e) => handleSeek(e, elements.lyricsProgressContainer));

// ============================================
// SETTINGS LOADING
// ============================================

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to fetch settings');

        const data = await res.json();
        if (data.success && data.settings && data.settings.playback) {
            showRequesterNameEnabled = data.settings.playback.showRequesterName !== false;
        }
    } catch (err) {
        console.error('Failed to load settings:', err);
        // Keep default value (true)
    }
}

// ============================================
// INITIALIZATION
// ============================================

if (window.opener) {
    window.opener.postMessage({ type: 'PLAYER_READY' }, '*');
}

loadSettings();
showIdleState();
renderLyrics(null);
drawVisualizer();

// Add resize listener to recalculate title scrolling
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        checkTitleOverflow();
    }, 150);
});

console.log('🎵 Fullscreen player initialized');
