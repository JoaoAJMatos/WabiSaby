/**
 * Audio and Visualizer Module
 * Handles audio context, visualizer, idle animation, and audio playback
 */

if (typeof localCurrentSong === 'undefined') {
    var localCurrentSong = null;
}

var audioContext = null;
var analyser = null;
var source = null;
var currentAudio = null;
var lastPlayedSong = null;
var isVisualizerRunning = false;
var playbackRetryCount = 0;

var idleAnimationFrame = null;
var isShowingIdle = true;

const barCurrentHeights = new Array(BAR_COUNT).fill(0);  // Current displayed heights
const barTargetHeights = new Array(BAR_COUNT).fill(0);   // Target heights to lerp to

let idleCanvasCtx = null;
let idleCanvasResized = false;

function initIdleAnimation() {
    const canvas = document.getElementById('visualizer-canvas');
    if (!canvas) return;
    
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
        
        const gradient = idleCanvasCtx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(52, 211, 153, 0.6)');
        gradient.addColorStop(0.6, 'rgba(52, 211, 153, 0.3)');
        gradient.addColorStop(1, 'rgba(52, 211, 153, 0.1)');
        
        idleCanvasCtx.fillStyle = gradient;
        
        for (let i = 0; i < BAR_COUNT; i++) {
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
            } else if (typeof localCurrentSong !== 'undefined' && localCurrentSong && !localCurrentSong.streamUrl) {
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
    if (currentAudio && typeof localCurrentSong !== 'undefined' && localCurrentSong && !localCurrentSong.isPaused && currentAudio.paused) {
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
            if (currentAudio && typeof localCurrentSong !== 'undefined' && localCurrentSong && !localCurrentSong.isPaused && currentAudio.paused) {
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
        if (currentAudio && typeof localCurrentSong !== 'undefined' && localCurrentSong && !localCurrentSong.isPaused && currentAudio.paused) {
            startAudioPlayback();
        }
    }
});

// User interaction to unlock AudioContext (required by browsers for actual audio)
// But we can show idle animation without user interaction
document.body.addEventListener('click', () => {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    } else if (!audioContext) {
        initVisualizer();
    }
}, { once: false, passive: true });

