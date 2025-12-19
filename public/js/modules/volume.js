/**
 * Volume Control Module
 * Handles volume control UI and API communication
 */

let currentVolume = 100;
let volumeUpdateTimeout = null;

/**
 * Load current volume from server
 */
async function loadVolume() {
    try {
        const response = await fetch('/api/volume');
        if (response.ok) {
            const data = await response.json();
            currentVolume = data.volume;
            updateVolumeUI(currentVolume);
        }
    } catch (err) {
        console.error('Failed to load volume:', err);
    }
}

/**
 * Update volume on server
 */
async function updateVolume(newVolume) {
    try {
        const response = await fetch('/api/volume', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ volume: newVolume })
        });
        if (response.ok) {
            const data = await response.json();
            currentVolume = data.volume;
            updateVolumeUI(currentVolume);
        }
    } catch (err) {
        console.error('Failed to update volume:', err);
    }
}

/**
 * Update volume UI
 */
function updateVolumeUI(volume) {
    const slider = document.getElementById('volume-slider');
    const valueDisplay = document.getElementById('volume-value');
    const icon = document.getElementById('volume-icon');
    
    if (slider) {
        slider.value = volume;
    }
    
    if (valueDisplay) {
        valueDisplay.textContent = `${Math.round(volume)}%`;
    }
    
    // Update icon based on volume level
    if (icon) {
        if (volume === 0) {
            icon.className = 'fas fa-volume-mute';
        } else if (volume < 50) {
            icon.className = 'fas fa-volume-down';
        } else {
            icon.className = 'fas fa-volume-up';
        }
    }
}

/**
 * Debounced volume update
 */
function debouncedVolumeUpdate(volume) {
    if (volumeUpdateTimeout) {
        clearTimeout(volumeUpdateTimeout);
    }
    volumeUpdateTimeout = setTimeout(() => {
        updateVolume(volume);
    }, 100); // Update quickly for responsive feel
}

/**
 * Initialize volume control listeners
 */
function initVolumeListeners() {
    const slider = document.getElementById('volume-slider');
    const valueDisplay = document.getElementById('volume-value');
    const volumeControl = document.querySelector('.np-volume-control');
    const volumeBtn = document.getElementById('volume-toggle-btn');
    
    // Keep slider visible when interacting with it
    if (slider) {
        slider.addEventListener('mouseenter', () => {
            if (volumeControl) {
                volumeControl.classList.add('expanded');
            }
        });
        
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (valueDisplay) {
                valueDisplay.textContent = `${Math.round(val)}%`;
            }
            // Update icon immediately for better UX
            const icon = document.getElementById('volume-icon');
            if (icon) {
                if (val === 0) {
                    icon.className = 'fas fa-volume-mute';
                } else if (val < 50) {
                    icon.className = 'fas fa-volume-down';
                } else {
                    icon.className = 'fas fa-volume-up';
                }
            }
            debouncedVolumeUpdate(val);
        });
        
        slider.addEventListener('mouseleave', () => {
            // Only collapse if not hovering over the control area
            setTimeout(() => {
                if (volumeControl && !volumeControl.matches(':hover')) {
                    volumeControl.classList.remove('expanded');
                }
            }, 200);
        });
    }
    
    // Toggle expand on button click
    if (volumeBtn) {
        volumeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (volumeControl) {
                volumeControl.classList.toggle('expanded');
            }
        });
    }
    
    // Keep expanded when hovering over control area
    if (volumeControl) {
        volumeControl.addEventListener('mouseleave', () => {
            setTimeout(() => {
                if (!volumeControl.matches(':hover')) {
                    volumeControl.classList.remove('expanded');
                }
            }, 200);
        });
    }
    
    // Load volume on init
    loadVolume();
}

// Make functions available globally
window.loadVolume = loadVolume;
window.updateVolume = updateVolume;
window.initVolumeListeners = initVolumeListeners;

