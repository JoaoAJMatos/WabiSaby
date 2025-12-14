/**
 * Fullscreen Player Module
 * Handles fullscreen player window management and communication
 */

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
        if (typeof localCurrentSong !== 'undefined' && localCurrentSong) {
            updateFullscreenWindow(localCurrentSong);
        }
    }, 500);
}

function updateFullscreenProgress(current, total, progressPercent) {
    // Include audio data with progress update as a fallback
    // This ensures player gets audio data at least once per second even if draw loop is throttled
    let audioData = null;
    if (typeof analyser !== 'undefined' && analyser && typeof currentAudio !== 'undefined' && currentAudio && !currentAudio.paused) {
        const bufferLength = analyser.frequencyBinCount;
        const data = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(data);
        audioData = Array.from(data);
    }
    
    if (typeof broadcast !== 'undefined') {
        broadcast.postMessage({
            type: 'PROGRESS_UPDATE',
            current,
            total,
            progress: progressPercent,
            audioData: audioData  // Fallback audio data
        });
    }
}

// Store current song data for fullscreen player seeking
function updateFullscreenWindow(song) {
    // Store song data for seeking
    if (song && typeof broadcast !== 'undefined') {
        broadcast.postMessage({
            type: 'SONG_DATA',
            song: {
                duration: song.duration,
                current: song.elapsed || 0
            }
        });
        
        // Use BroadcastChannel for reliable updates
        broadcast.postMessage({
            type: 'SONG_UPDATE',
            song: song
        });
    }
}

