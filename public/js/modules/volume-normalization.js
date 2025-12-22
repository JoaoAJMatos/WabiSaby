/**
 * Volume Normalization UI Module
 * Handles volume normalization settings UI, visual feedback, and validation
 */

let normalizationSettings = null;
let saveTimeout = null;
const RANGE_MIN = -40;
const RANGE_MAX = 0;

/**
 * Load volume normalization settings from API
 */
async function loadVolumeNormalizationSettings() {
    try {
        const response = await fetch('/api/volume-normalization/settings');
        if (!response.ok) throw new Error('Failed to fetch settings');
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to load settings');
        
        normalizationSettings = data.settings;
        // Remove thresholdOk if it exists (backward compatibility)
        if (normalizationSettings.thresholdOk !== undefined) {
            delete normalizationSettings.thresholdOk;
        }
        applySettingsToUI();
        updateVisualRange();
        setupDragHandlers();
        
        return normalizationSettings;
    } catch (error) {
        console.error('Failed to load volume normalization settings:', error);
        // Use defaults if API fails
        normalizationSettings = {
            enabled: false,
            thresholdTooLow: -20,
            thresholdTooHigh: -6,
            targetLevel: -12
        };
        applySettingsToUI();
        updateVisualRange();
        setupDragHandlers();
        return normalizationSettings;
    }
}

/**
 * Apply settings to UI controls
 */
function applySettingsToUI() {
    if (!normalizationSettings) return;
    
    const enabledToggle = document.getElementById('setting-volumeNormalizationEnabled');
    if (enabledToggle) {
        enabledToggle.checked = normalizationSettings.enabled;
    }
}

/**
 * Update visual range component based on current settings
 */
function updateVisualRange() {
    if (!normalizationSettings) return;
    
    const { thresholdTooLow, thresholdTooHigh, targetLevel } = normalizationSettings;
    
    // Calculate positions as percentages (0-100%)
    const range = RANGE_MAX - RANGE_MIN;
    const posTooLow = ((thresholdTooLow - RANGE_MIN) / range) * 100;
    const posTooHigh = ((thresholdTooHigh - RANGE_MIN) / range) * 100;
    const posTarget = ((targetLevel - RANGE_MIN) / range) * 100;
    
    // Update marker positions
    const markerTooLow = document.getElementById('marker-too-low');
    const markerTooHigh = document.getElementById('marker-too-high');
    const markerTarget = document.getElementById('marker-target');
    
    if (markerTooLow) {
        markerTooLow.style.left = `${posTooLow}%`;
        const valueEl = markerTooLow.querySelector('.marker-value');
        if (valueEl) valueEl.textContent = thresholdTooLow;
    }
    
    if (markerTooHigh) {
        markerTooHigh.style.left = `${posTooHigh}%`;
        const valueEl = markerTooHigh.querySelector('.marker-value');
        if (valueEl) valueEl.textContent = thresholdTooHigh;
    }
    
    if (markerTarget) {
        markerTarget.style.left = `${posTarget}%`;
        const valueEl = markerTarget.querySelector('.marker-value');
        if (valueEl) valueEl.textContent = targetLevel;
    }
    
    // Update zone widths (3 zones: too-low, ok, too-high)
    const zoneTooLow = document.getElementById('zone-too-low');
    const zoneOk = document.getElementById('zone-ok');
    const zoneTooHigh = document.getElementById('zone-too-high');
    
    if (zoneTooLow) {
        zoneTooLow.style.width = `${posTooLow}%`;
    }
    
    // OK zone is inferred between too-low and too-high
    if (zoneOk) {
        zoneOk.style.left = `${posTooLow}%`;
        zoneOk.style.width = `${posTooHigh - posTooLow}%`;
    }
    
    if (zoneTooHigh) {
        zoneTooHigh.style.left = `${posTooHigh}%`;
        zoneTooHigh.style.width = `${100 - posTooHigh}%`;
    }
    
    // Update decibel axis
    updateDecibelAxis();
    
    // Validate and show errors if needed
    validateThresholds();
}

/**
 * Generate and update the decibel axis with tick marks and labels
 */
function updateDecibelAxis() {
    const axisContainer = document.getElementById('volume-range-axis');
    if (!axisContainer) return;
    
    // Clear existing ticks
    axisContainer.innerHTML = '';
    
    // Generate ticks every 5 dB from -40 to 0
    const tickInterval = 5;
    const ticks = [];
    for (let db = RANGE_MIN; db <= RANGE_MAX; db += tickInterval) {
        ticks.push(db);
    }
    
    // Calculate position for each tick
    const range = RANGE_MAX - RANGE_MIN;
    
    ticks.forEach(db => {
        const position = ((db - RANGE_MIN) / range) * 100;
        
        const tick = document.createElement('div');
        tick.className = 'volume-axis-tick';
        tick.style.left = `${position}%`;
        
        const label = document.createElement('div');
        label.className = 'volume-axis-tick-label';
        label.textContent = `${db} dB`;
        
        tick.appendChild(label);
        axisContainer.appendChild(tick);
    });
}

/**
 * Validate threshold ordering and target level
 */
function validateThresholds() {
    if (!normalizationSettings) return true;
    
    const { thresholdTooLow, thresholdTooHigh, targetLevel } = normalizationSettings;
    
    const errors = [];
    
    // Check ordering
    if (thresholdTooLow >= thresholdTooHigh) {
        errors.push('Too Low threshold must be less than Too High threshold');
    }
    
    // Check target level is within range
    if (targetLevel < thresholdTooLow || targetLevel > thresholdTooHigh) {
        errors.push('Target level must be between Too Low and Too High thresholds');
    }
    
    // Update UI to show errors
    const rangeContainer = document.getElementById('volume-normalization-range');
    if (rangeContainer) {
        if (errors.length > 0) {
            rangeContainer.classList.add('has-errors');
            // Show error message
            let errorMsg = rangeContainer.querySelector('.range-error-message');
            if (!errorMsg) {
                errorMsg = document.createElement('div');
                errorMsg.className = 'range-error-message';
                rangeContainer.appendChild(errorMsg);
            }
            errorMsg.textContent = errors[0];
            errorMsg.style.display = 'block';
        } else {
            rangeContainer.classList.remove('has-errors');
            const errorMsg = rangeContainer.querySelector('.range-error-message');
            if (errorMsg) {
                errorMsg.style.display = 'none';
            }
        }
    }
    
    return errors.length === 0;
}

/**
 * Calculate RMS level from audio analyser time domain data
 * @returns {number|null} RMS level in dB, or null if not available
 */
function calculateCurrentRMS() {
    // Check if analyser is available (from audio.js module)
    if (typeof analyser === 'undefined' || !analyser) {
        return null;
    }
    
    // Check if audio is playing
    if (typeof currentAudio === 'undefined' || !currentAudio || currentAudio.paused) {
        return null;
    }
    
    try {
        // Get time domain data (waveform samples)
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);
        
        // Calculate RMS (Root Mean Square)
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
            // Convert from 0-255 range to -1 to 1 range
            const normalized = (dataArray[i] - 128) / 128;
            sumSquares += normalized * normalized;
        }
        
        const rms = Math.sqrt(sumSquares / bufferLength);
        
        // Convert to dB
        // Avoid log(0) by using a small epsilon
        const rmsDb = rms > 0.0001 ? 20 * Math.log10(rms) : -100;
        
        return rmsDb;
    } catch (error) {
        console.debug('Error calculating RMS:', error);
        return null;
    }
}

/**
 * Update current song indicator on the visual range
 */
function updateCurrentSongIndicator() {
    const markerCurrent = document.getElementById('marker-current-song');
    if (!markerCurrent) return;
    
    const rmsDb = calculateCurrentRMS();
    
    if (rmsDb !== null && isFinite(rmsDb)) {
        // Clamp to visible range
        const clampedRms = Math.max(RANGE_MIN, Math.min(RANGE_MAX, rmsDb));
        
        // Calculate position on graph
        const range = RANGE_MAX - RANGE_MIN;
        const pos = ((clampedRms - RANGE_MIN) / range) * 100;
        
        // Update marker position
        markerCurrent.style.left = `${pos}%`;
        markerCurrent.style.display = 'block';
        
        // Update value display
        const valueEl = markerCurrent.querySelector('.marker-value');
        if (valueEl) {
            valueEl.textContent = clampedRms.toFixed(1);
        }
    } else {
        // Hide marker if no audio or calculation failed
        markerCurrent.style.display = 'none';
    }
}

/**
 * Save settings to API with debouncing
 */
async function saveVolumeNormalizationSettings() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    saveTimeout = setTimeout(async () => {
        if (!normalizationSettings) return;
        
        // Validate before saving
        if (!validateThresholds()) {
            console.warn('Cannot save: Invalid threshold configuration');
            return;
        }
        
        try {
            const response = await fetch('/api/volume-normalization/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(normalizationSettings)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save settings');
            }
            
            const data = await response.json();
            if (data.success) {
                normalizationSettings = data.settings;
                showSaveIndicator();
                console.log('Volume normalization settings saved');
            }
        } catch (error) {
            console.error('Failed to save volume normalization settings:', error);
            // Reload settings to revert
            loadVolumeNormalizationSettings();
        }
    }, 500);
}

/**
 * Show save indicator
 */
function showSaveIndicator() {
    const indicator = document.getElementById('settings-save-indicator');
    if (indicator) {
        indicator.classList.add('visible');
        setTimeout(() => {
            indicator.classList.remove('visible');
        }, 2000);
    }
}

/**
 * Update a setting value
 */
function updateSetting(key, value) {
    if (!normalizationSettings) {
        normalizationSettings = {
            enabled: false,
            thresholdTooLow: -20,
            thresholdTooHigh: -6,
            targetLevel: -12
        };
    }
    
    normalizationSettings[key] = value;
    updateVisualRange();
    saveVolumeNormalizationSettings();
}


/**
 * Convert pixel position to dB value
 */
function pixelToDb(pixelX, trackElement) {
    const rect = trackElement.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(100, ((pixelX - rect.left) / rect.width) * 100));
    const db = RANGE_MIN + (percentage / 100) * (RANGE_MAX - RANGE_MIN);
    return Math.round(db);
}

/**
 * Handle marker drag
 */
let dragState = null;

function handleDragStart(e, markerType) {
    e.preventDefault();
    e.stopPropagation();
    
    const marker = e.currentTarget;
    const track = document.querySelector('.volume-range-track');
    if (!track || !normalizationSettings) return;
    
    dragState = {
        markerType,
        marker,
        track,
        startX: e.touches ? e.touches[0].clientX : e.clientX,
        startLeft: parseFloat(marker.style.left) || 0
    };
    
    marker.classList.add('dragging');
    // Disable transitions during drag for immediate feedback
    const allMarkers = document.querySelectorAll('.volume-marker');
    allMarkers.forEach(m => {
        m.style.transition = 'none';
    });
    
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    
    // Add global listeners
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('touchend', handleDragEnd);
}

function handleDragMove(e) {
    if (!dragState) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const db = pixelToDb(clientX, dragState.track);
    
    // Apply constraints based on marker type
    let constrainedDb = db;
    const { thresholdTooLow, thresholdTooHigh, targetLevel } = normalizationSettings;
    
    if (dragState.markerType === 'thresholdTooLow') {
        // Can't go past thresholdTooHigh
        constrainedDb = Math.min(constrainedDb, thresholdTooHigh - 1);
        // Can't go outside range
        constrainedDb = Math.max(RANGE_MIN, Math.min(RANGE_MAX, constrainedDb));
    } else if (dragState.markerType === 'thresholdTooHigh') {
        // Can't go past thresholdTooLow
        constrainedDb = Math.max(constrainedDb, thresholdTooLow + 1);
        // Can't go outside range
        constrainedDb = Math.max(RANGE_MIN, Math.min(RANGE_MAX, constrainedDb));
    } else if (dragState.markerType === 'targetLevel') {
        // Must stay between thresholds
        constrainedDb = Math.max(thresholdTooLow, Math.min(thresholdTooHigh, constrainedDb));
    }
    
    // Update setting
    normalizationSettings[dragState.markerType] = constrainedDb;
    
    // Update visual immediately
    updateVisualRange();
}

function handleDragEnd(e) {
    if (!dragState) return;
    
    dragState.marker.classList.remove('dragging');
    // Re-enable transitions after drag
    const allMarkers = document.querySelectorAll('.volume-marker');
    allMarkers.forEach(m => {
        m.style.transition = '';
    });
    
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    
    // Remove global listeners
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchmove', handleDragMove);
    document.removeEventListener('touchend', handleDragEnd);
    
    // Save settings
    saveVolumeNormalizationSettings();
    
    dragState = null;
}

/**
 * Set up drag handlers for draggable markers
 */
function setupDragHandlers() {
    const draggableMarkers = document.querySelectorAll('.draggable-marker');
    draggableMarkers.forEach(marker => {
        // Skip if already has drag listeners (check for data attribute)
        if (marker.dataset.dragHandlersSetup === 'true') return;
        
        const markerType = marker.getAttribute('data-marker-type');
        if (markerType) {
            marker.addEventListener('mousedown', (e) => handleDragStart(e, markerType));
            marker.addEventListener('touchstart', (e) => handleDragStart(e, markerType), { passive: false });
            marker.dataset.dragHandlersSetup = 'true';
        }
    });
}

/**
 * Initialize volume normalization UI
 */
function initVolumeNormalization() {
    // Load settings (will call setupDragHandlers after load)
    loadVolumeNormalizationSettings();
    
    // Enable/disable toggle
    const enabledToggle = document.getElementById('setting-volumeNormalizationEnabled');
    if (enabledToggle) {
        enabledToggle.addEventListener('change', (e) => {
            updateSetting('enabled', e.target.checked);
        });
    }
    
    // Set up Intersection Observer to start/stop monitoring based on panel visibility
    const audioPanel = document.querySelector('.settings-panel[data-panel="audio"]');
    if (audioPanel) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Panel is visible, start monitoring
                    startRMSMonitoring();
                } else {
                    // Panel is hidden, stop monitoring to save resources
                    stopRMSMonitoring();
                }
            });
        }, { threshold: 0.1 });
        
        observer.observe(audioPanel);
        
        // Also start monitoring if panel is already active
        if (audioPanel.classList.contains('active')) {
            startRMSMonitoring();
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVolumeNormalization);
} else {
    initVolumeNormalization();
}

/**
 * Start real-time RMS monitoring
 */
function startRMSMonitoring() {
    // Don't start if already monitoring
    if (window.volumeNormalizationRMSInterval) {
        return;
    }
    
    // Update every ~100ms for smooth animation (10 updates/sec)
    window.volumeNormalizationRMSInterval = setInterval(() => {
        updateCurrentSongIndicator();
    }, 100);
}

/**
 * Stop real-time RMS monitoring
 */
function stopRMSMonitoring() {
    if (window.volumeNormalizationRMSInterval) {
        clearInterval(window.volumeNormalizationRMSInterval);
        window.volumeNormalizationRMSInterval = null;
    }
    
    // Hide marker
    const markerCurrent = document.getElementById('marker-current-song');
    if (markerCurrent) {
        markerCurrent.style.display = 'none';
    }
}

// Export for use in other modules
window.volumeNormalization = {
    loadSettings: loadVolumeNormalizationSettings,
    updateVisualRange: updateVisualRange,
    validateThresholds: validateThresholds,
    updateCurrentSongIndicator: updateCurrentSongIndicator,
    startRMSMonitoring: startRMSMonitoring,
    stopRMSMonitoring: stopRMSMonitoring
};

