        // ============================================
        // STATE & CONFIG
        // ============================================
        
        const CONFIG = {
            AUDIO_STALE_MS: 1500,
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
            dataIndicator: document.getElementById('data-indicator'),
            // Lyrics mode elements
            miniAlbumImg: document.getElementById('mini-album-img'),
            lyricsTitle: document.getElementById('lyrics-title'),
            lyricsArtist: document.getElementById('lyrics-artist'),
            lyricsProgressBar: document.getElementById('lyrics-progress-bar'),
            lyricsProgressContainer: document.getElementById('lyrics-progress-container'),
            lyricsCurrentTime: document.getElementById('lyrics-current-time'),
            lyricsTotalTime: document.getElementById('lyrics-total-time'),
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
        // BAR VISUALIZER
        // ============================================
        
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
                
                if (hasAudio && audioDataArray.length > 0) {
                    // Map frequency to bar index (now high freqs at center due to reversal)
                    const indexRatio = reversedI / halfBarCount;
                    // Logarithmic scale
                    const freqIndex = Math.floor(Math.pow(indexRatio, 1.5) * audioDataArray.length * 0.6);
                    
                    // Average window
                    const window = 2;
                    let sum = 0;
                    for(let w = 0; w < window; w++) {
                        const idx = Math.min(freqIndex + w, audioDataArray.length - 1);
                        sum += audioDataArray[idx];
                    }
                    const val = (sum / window) / 255;
                    
                    targetHeight = val * height; // Scale to canvas height
                } else {
                    const offset = reversedI * 0.2;
                    const val = Math.sin(time * 2 + offset) * 0.2 + 0.2;
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
                shadowGradient.addColorStop(0, `rgba(52, 211, 153, ${shadowOpacity})`);
                shadowGradient.addColorStop(0.5, `rgba(52, 211, 153, ${shadowOpacity * 0.5})`);
                shadowGradient.addColorStop(1, 'rgba(52, 211, 153, 0)');
                
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
        }
        
        // Remove drawWave function as it is no longer used
        
        // ============================================
        // SONG INFO & LYRICS
        // ============================================
        
        function showIdleState() {
            document.body.classList.add('idle-state');
            elements.songTitle.textContent = 'Waiting for music...';
            elements.songArtist.textContent = '';
            elements.songRequester.innerHTML = '<i class="fas fa-user-circle"></i> <span>-</span>';
            
            elements.albumImg.classList.remove('visible');
            elements.albumPlaceholder.style.display = 'flex';
            
            elements.bgBlur.classList.remove('active');
            elements.bgBlur.style.backgroundImage = '';
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

        function updateLyrics(data) {
            currentLyrics = null;
            currentLineIndex = -1;
            
            // Update song info from lyrics API if available
            if (data && !data.notFound && data.trackName && data.artistName) {
                elements.songTitle.textContent = data.trackName;
                elements.songArtist.textContent = data.artistName;
                elements.songArtist.style.display = 'block';
                elements.lyricsTitle.textContent = data.trackName;
                elements.lyricsArtist.textContent = data.artistName;
                document.title = `${data.trackName} • ${data.artistName}`;
            }
            
            if (!data) {
                hasLyrics = false;
                elements.btnLyrics.disabled = true;
                renderLyrics(null, 'Loading lyrics...');
                return;
            }

            if (data.notFound || !data.syncedLyrics || data.syncedLyrics.length === 0) {
                hasLyrics = false;
                elements.btnLyrics.disabled = true;
                renderLyrics(null);
                
                // Switch to visualizer if in lyrics mode
                if (showLyricsMode) {
                    setVisualizerMode();
                }
                return;
            }
            
            hasLyrics = true;
            currentLyrics = data.syncedLyrics;
            elements.btnLyrics.disabled = false;
            renderLyrics(currentLyrics);
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
            
            // Add top spacer for centering
            const topSpacer = document.createElement('div');
            topSpacer.style.height = '40vh';
            topSpacer.style.flexShrink = '0';
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
            
            // Add bottom spacer
            const bottomSpacer = document.createElement('div');
            bottomSpacer.style.height = '45vh';
            bottomSpacer.style.flexShrink = '0';
            container.appendChild(bottomSpacer);
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
                const currentTimeSec = data.current / 1000;
                
                let activeIndex = -1;
                for (let i = 0; i < currentLyrics.length; i++) {
                    if (currentTimeSec >= currentLyrics[i].time) {
                        activeIndex = i;
                    } else {
                        break;
                    }
                }
                
                if (activeIndex !== currentLineIndex) {
                    currentLineIndex = activeIndex;
                    highlightLyricLine(activeIndex);
                    scrollToLyricLine(activeIndex);
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

        function scrollToLyricLine(index) {
            if (index < 0) return;
            
            const lines = document.querySelectorAll('.lyric-line');
            if (index >= lines.length) return;
            
            const line = lines[index];
            const container = elements.lyricsContainer;
            const stage = document.querySelector('.lyrics-stage');
            
            if (!stage) return;
            
            // Calculate offset to center the active line
            const stageRect = stage.getBoundingClientRect();
            const stageCenter = stageRect.height / 2;
            
            const lineCenter = line.offsetTop + line.offsetHeight / 2;
            const targetOffset = lineCenter - stageCenter;
            
            container.style.transform = `translateY(-${Math.max(0, targetOffset)}px)`;
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
        }
        
        function setLyricsMode() {
            if (!hasLyrics) return;
            
            document.body.classList.remove('visualizer-mode');
            document.body.classList.add('lyrics-mode');
            elements.btnLyrics.classList.add('active');
            elements.btnVisualizer.classList.remove('active');
            showLyricsMode = true;
            
            // Re-scroll to current line
            if (currentLineIndex >= 0) {
                setTimeout(() => scrollToLyricLine(currentLineIndex), 100);
            }
        }
        
        elements.btnVisualizer.addEventListener('click', setVisualizerMode);
        elements.btnLyrics.addEventListener('click', setLyricsMode);
        
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
        
        console.log('🎵 Fullscreen player initialized');
