/**
 * Audio Effects Module
 * Handles audio effects management and presets
 */

let currentEffects = null;
let effectsPresets = [];
let effectsUpdateTimeout = null;
let effectsBackend = 'ffplay';
let effectsSeamless = false;
let effectsPollInterval = null;
let effectsUpdateInProgress = false; // Flag to prevent overwriting local changes
// Load effects mode from localStorage, default to 'simple'
let effectsMode = localStorage.getItem('wabisaby_effects_mode') || 'simple';
let eqDragging = null; // Track which EQ point is being dragged
let eqTooltip = null; // EQ tooltip element
let eqSpectrumEnabled = localStorage.getItem('wabisaby_eq_spectrum_enabled') === 'true'; // Spectrum visualization toggle
let audioDataArray = null; // Current audio frequency data
let spectrumAnimationFrame = null; // Animation frame ID for spectrum updates

// Broadcast Channel for syncing effects with player
const effectsBroadcast = new BroadcastChannel('wabisaby_audio_channel');

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
            updateCurrentPresetDisplay(currentEffects.preset);
            updateBackendIndicator();
            syncModeValues();
            if (effectsMode === 'advanced') {
                setTimeout(() => {
                    initGraphicalEQ();
                    updateEQCurve();
                }, 100);
            }
            // Broadcast initial effects
            effectsBroadcast.postMessage({ type: 'EFFECTS_UPDATE', effects: currentEffects });
            
            // Start periodic polling for cross-device synchronization
            startEffectsPolling();
        }
    } catch (err) {
        console.error('Failed to load effects:', err);
    }
}

/**
 * Periodically poll for effects updates to sync across devices
 */
async function pollEffects() {
    // Don't poll if a local update is in progress
    if (effectsUpdateInProgress) return;
    
    try {
        const response = await fetch('/api/effects');
        if (response.ok) {
            const data = await response.json();
            const newEffects = data.effects;
            
            // Only update if effects have actually changed
            if (JSON.stringify(newEffects) !== JSON.stringify(currentEffects)) {
                currentEffects = newEffects;
                if (data.presets && data.presets.length > 0) {
                    effectsPresets = data.presets;
                }
                updateEffectsUI(currentEffects);
                renderEffectsPresets(effectsPresets, currentEffects.preset);
                updateCurrentPresetDisplay(currentEffects.preset);
                // Don't broadcast here to avoid loops - the change came from another device
            }
        }
    } catch (err) {
        // Silently fail - polling errors shouldn't be disruptive
    }
}

/**
 * Start periodic polling for effects updates (every 3 seconds)
 */
function startEffectsPolling() {
    // Clear any existing interval
    if (effectsPollInterval) {
        clearInterval(effectsPollInterval);
    }
    
    // Poll every 3 seconds for cross-device synchronization
    effectsPollInterval = setInterval(pollEffects, 3000);
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
    // Set flag to prevent polling from overwriting our changes
    effectsUpdateInProgress = true;
    
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
            // Broadcast update
            effectsBroadcast.postMessage({ type: 'EFFECTS_UPDATE', effects: currentEffects });
        }
    } catch (err) {
        console.error('Failed to update effects:', err);
    } finally {
        // Clear the flag after update completes
        setTimeout(() => {
            effectsUpdateInProgress = false;
        }, 500);
    }
}

/**
 * Apply a preset
 */
async function applyEffectsPreset(presetId) {
    // Set flag to prevent polling from overwriting our changes
    effectsUpdateInProgress = true;
    
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
            // Broadcast update
            effectsBroadcast.postMessage({ type: 'EFFECTS_UPDATE', effects: currentEffects });
        }
    } catch (err) {
        console.error('Failed to apply preset:', err);
    } finally {
        // Clear the flag after update completes
        setTimeout(() => {
            effectsUpdateInProgress = false;
        }, 500);
    }
}

/**
 * Reset all effects to default
 */
async function resetAllEffects() {
    // Set flag to prevent polling from overwriting our changes
    effectsUpdateInProgress = true;
    
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
            // Broadcast update
            effectsBroadcast.postMessage({ type: 'EFFECTS_UPDATE', effects: currentEffects });
        }
    } catch (err) {
        console.error('Failed to reset effects:', err);
    } finally {
        // Clear the flag after update completes
        setTimeout(() => {
            effectsUpdateInProgress = false;
        }, 500);
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

    // Speed (advanced mode only)
    const speedSlider = document.getElementById('effect-speed');
    const speedValue = document.getElementById('effect-speed-value');
    if (speedSlider) {
        speedSlider.value = effects.speed;
        if (speedValue) speedValue.textContent = `${effects.speed.toFixed(2)}x`;
    }

    // EQ (advanced mode only)
    ['bass', 'mid', 'treble'].forEach(band => {
        updateEQSlider(band, effects.eq?.[band] || 0);
    });
    
    // Update EQ curve if in advanced mode
    if (effectsMode === 'advanced') {
        updateEQCurve();
    }

    // Update effect cards and intensities
    ['reverb', 'echo', 'distortion', 'compressor'].forEach(effectName => {
        updateEffectCard(effectName, effects[effectName]);
        
        // Update intensity displays
        const settings = effects[effectName];
        let intensity = 0;
        switch (effectName) {
            case 'reverb':
                intensity = getReverbIntensity(settings);
                break;
            case 'echo':
                intensity = getEchoIntensity(settings);
                break;
            case 'distortion':
                intensity = getDistortionIntensity(settings);
                break;
            case 'compressor':
                intensity = getCompressorIntensity(settings);
                break;
        }
        
        // Update advanced mode intensity
        const advIntensity = document.getElementById(`effect-${effectName}-intensity-adv`);
        if (advIntensity) {
            advIntensity.value = intensity;
            const valueDisplay = document.getElementById(`effect-${effectName}-intensity-value-adv`);
            if (valueDisplay) valueDisplay.textContent = `${intensity}%`;
        }
        
        // Update enabled toggle (advanced mode only)
        const advEnabled = document.getElementById(`effect-${effectName}-enabled`);
        if (advEnabled) advEnabled.checked = settings?.enabled || false;
    });
}

/**
 * Update an EQ slider
 */
function updateEQSlider(bandId, value) {
    const slider = document.getElementById(`effect-eq-${bandId}`);
    const valueDisplay = document.getElementById(`effect-eq-${bandId}-value`);
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

    // Update advanced mode enabled toggle
    const enabledToggle = document.getElementById(`effect-${effectName}-enabled`);
    if (enabledToggle) enabledToggle.checked = settings.enabled;

    const controls = document.getElementById(`effect-${effectName}-controls`);
    if (controls) {
        controls.style.opacity = settings.enabled ? '1' : '0.5';
        controls.style.pointerEvents = settings.enabled ? 'auto' : 'none';
    }

    // Update individual sliders (advanced mode only)
    Object.entries(settings).forEach(([key, value]) => {
        if (key === 'enabled') return;
        const slider = document.getElementById(`effect-${effectName}-${key}`);
        if (slider) {
            slider.value = value;
            const miniControl = slider.closest('.mini-control');
            if (miniControl) {
                const valueDisplay = miniControl.querySelector('.mini-value');
                if (valueDisplay) {
                    valueDisplay.textContent = formatEffectValue(effectName, key, value);
                }
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
 * Get reverb intensity from parameters (0-100)
 */
function getReverbIntensity(reverbSettings) {
    if (!reverbSettings || !reverbSettings.enabled) return 0;
    const avg = (reverbSettings.roomSize + reverbSettings.wetLevel) / 2;
    return Math.round((avg / 0.9) * 100);
}

/**
 * Get echo intensity from parameters (0-100)
 */
function getEchoIntensity(echoSettings) {
    if (!echoSettings || !echoSettings.enabled) return 0;
    const normalized = (echoSettings.decay - 0.1) / 0.7;
    return Math.round(Math.max(0, Math.min(100, normalized * 100)));
}

/**
 * Get distortion intensity from parameters (0-100)
 */
function getDistortionIntensity(distortionSettings) {
    if (!distortionSettings || !distortionSettings.enabled) return 0;
    return Math.round(((distortionSettings.drive - 0.1) / 0.9) * 100);
}

/**
 * Get compressor intensity from parameters (0-100)
 */
function getCompressorIntensity(compressorSettings) {
    if (!compressorSettings || !compressorSettings.enabled) return 0;
    const normalized = (compressorSettings.threshold + 40) / 40;
    return Math.round(Math.max(0, Math.min(100, normalized * 100)));
}

/**
 * Convert intensity (0-100) to reverb parameters
 */
function intensityToReverbParams(intensity) {
    if (intensity <= 0) {
        return { enabled: false, roomSize: 0.5, wetLevel: 0.3, damping: 0.5 };
    }
    const normalized = intensity / 100;
    return {
        enabled: true,
        roomSize: Math.max(0.1, normalized * 0.9 + 0.1),
        wetLevel: Math.max(0.1, normalized * 0.7 + 0.1),
        damping: 0.5
    };
}

/**
 * Convert intensity (0-100) to echo parameters
 */
function intensityToEchoParams(intensity) {
    if (intensity <= 0) {
        return { enabled: false, delay: 300, decay: 0.4 };
    }
    const normalized = intensity / 100;
    return {
        enabled: true,
        delay: Math.round(200 + normalized * 500),
        decay: Math.max(0.1, normalized * 0.7 + 0.1)
    };
}

/**
 * Convert intensity (0-100) to distortion parameters
 */
function intensityToDistortionParams(intensity) {
    if (intensity <= 0) {
        return { enabled: false, drive: 0.5 };
    }
    const normalized = intensity / 100;
    return {
        enabled: true,
        drive: Math.max(0.1, normalized * 0.9 + 0.1)
    };
}

/**
 * Convert intensity (0-100) to compressor parameters
 */
function intensityToCompressorParams(intensity) {
    if (intensity <= 0) {
        return { enabled: false, threshold: -20, ratio: 4 };
    }
    const normalized = intensity / 100;
    return {
        enabled: true,
        threshold: Math.round(-40 + normalized * 20),
        ratio: Math.round(1 + normalized * 9)
    };
}

/**
 * Handle effect intensity changes
 */
function handleEffectIntensityChange(effectName, intensity) {
    let settings = {};
    switch (effectName) {
        case 'reverb':
            settings = { reverb: intensityToReverbParams(intensity) };
            break;
        case 'echo':
            settings = { echo: intensityToEchoParams(intensity) };
            break;
        case 'distortion':
            settings = { distortion: intensityToDistortionParams(intensity) };
            break;
        case 'compressor':
            settings = { compressor: intensityToCompressorParams(intensity) };
            break;
    }
    if (Object.keys(settings).length > 0) {
        debouncedEffectsUpdate(settings);
    }
}

/**
 * Toggle advanced controls for an effect
 */
function toggleEffectAdvanced(effectName) {
    const advancedControls = document.getElementById(`effect-${effectName}-advanced`);
    const advancedBtn = document.querySelector(`[data-effect="${effectName}"]`);
    if (advancedControls && advancedBtn) {
        const isVisible = advancedControls.style.display !== 'none';
        advancedControls.style.display = isVisible ? 'none' : 'flex';
        advancedBtn.classList.toggle('active', !isVisible);
    }
}

/**
 * Toggle effects mode (simple/advanced)
 */
function toggleEffectsMode() {
    effectsMode = effectsMode === 'simple' ? 'advanced' : 'simple';
    // Save mode preference to localStorage
    localStorage.setItem('wabisaby_effects_mode', effectsMode);
    
    const simpleMode = document.getElementById('effects-simple-mode');
    const advancedMode = document.getElementById('effects-advanced-mode');
    const quickAdjustments = document.getElementById('effects-quick-adjustments-row');
    const modeLabel = document.getElementById('effects-mode-label');
    const modeToggle = document.getElementById('effects-mode-toggle');
    
    if (effectsMode === 'simple') {
        simpleMode.style.display = 'block';
        advancedMode.style.display = 'none';
        if (quickAdjustments) quickAdjustments.style.display = 'block';
        if (modeLabel) modeLabel.textContent = 'Simple';
        if (modeToggle) modeToggle.classList.remove('active');
    } else {
        simpleMode.style.display = 'none';
        advancedMode.style.display = 'block';
        if (quickAdjustments) quickAdjustments.style.display = 'none';
        if (modeLabel) modeLabel.textContent = 'Advanced';
        if (modeToggle) modeToggle.classList.add('active');
        setTimeout(() => initGraphicalEQ(), 100);
    }
    syncModeValues();
}

/**
 * Restore effects mode from localStorage
 */
function restoreEffectsMode() {
    const savedMode = localStorage.getItem('wabisaby_effects_mode') || 'simple';
    effectsMode = savedMode;
    
    const simpleMode = document.getElementById('effects-simple-mode');
    const advancedMode = document.getElementById('effects-advanced-mode');
    const quickAdjustments = document.getElementById('effects-quick-adjustments-row');
    const modeLabel = document.getElementById('effects-mode-label');
    const modeToggle = document.getElementById('effects-mode-toggle');
    
    if (effectsMode === 'simple') {
        if (simpleMode) simpleMode.style.display = 'block';
        if (advancedMode) advancedMode.style.display = 'none';
        if (quickAdjustments) quickAdjustments.style.display = 'block';
        if (modeLabel) modeLabel.textContent = 'Simple';
        if (modeToggle) modeToggle.classList.remove('active');
    } else {
        if (simpleMode) simpleMode.style.display = 'none';
        if (advancedMode) advancedMode.style.display = 'block';
        if (quickAdjustments) quickAdjustments.style.display = 'none';
        if (modeLabel) modeLabel.textContent = 'Advanced';
        if (modeToggle) modeToggle.classList.add('active');
        setTimeout(() => initGraphicalEQ(), 100);
    }
}

/**
 * Sync values between simple and advanced modes
 */
function syncModeValues() {
    if (!currentEffects) return;
    // In simple mode, we don't have sliders to sync - values are managed through quick adjustments
    // Only sync advanced mode controls
    const speedAdvanced = document.getElementById('effect-speed');
    if (speedAdvanced) {
        speedAdvanced.value = currentEffects.speed;
    }
    ['bass', 'mid', 'treble'].forEach(band => {
        const advanced = document.getElementById(`effect-eq-${band}`);
        if (advanced) {
            advanced.value = currentEffects.eq?.[band] || 0;
        }
    });
    ['reverb', 'echo', 'distortion', 'compressor'].forEach(effect => {
        const settings = currentEffects[effect];
        let intensity = 0;
        switch (effect) {
            case 'reverb':
                intensity = getReverbIntensity(settings);
                break;
            case 'echo':
                intensity = getEchoIntensity(settings);
                break;
            case 'distortion':
                intensity = getDistortionIntensity(settings);
                break;
            case 'compressor':
                intensity = getCompressorIntensity(settings);
                break;
        }
        const advIntensity = document.getElementById(`effect-${effect}-intensity-adv`);
        if (advIntensity) {
            advIntensity.value = intensity;
            const valueDisplay = document.getElementById(`effect-${effect}-intensity-value-adv`);
            if (valueDisplay) valueDisplay.textContent = `${intensity}%`;
        }
        const advEnabled = document.getElementById(`effect-${effect}-enabled`);
        if (advEnabled) {
            advEnabled.checked = settings?.enabled || false;
        }
    });
}

/**
 * Handle quick adjustment button clicks
 */
function handleQuickAdjustment(action) {
    if (!currentEffects) return;
    const adjustments = {
        'bass-up': () => {
            const newBass = Math.min((currentEffects.eq?.bass || 0) + 3, 20);
            debouncedEffectsUpdate({ eq: { ...currentEffects.eq, bass: newBass } });
        },
        'bass-down': () => {
            const newBass = Math.max((currentEffects.eq?.bass || 0) - 3, -20);
            debouncedEffectsUpdate({ eq: { ...currentEffects.eq, bass: newBass } });
        },
        'reverb-up': () => {
            const intensity = getReverbIntensity(currentEffects.reverb);
            const newIntensity = Math.min(intensity + 10, 100);
            handleEffectIntensityChange('reverb', newIntensity);
        },
        'reverb-down': () => {
            const intensity = getReverbIntensity(currentEffects.reverb);
            const newIntensity = Math.max(intensity - 10, 0);
            handleEffectIntensityChange('reverb', newIntensity);
        },
        'faster': () => {
            const newSpeed = Math.min(currentEffects.speed + 0.1, 3.0);
            debouncedEffectsUpdate({ speed: newSpeed });
        },
        'slower': () => {
            const newSpeed = Math.max(currentEffects.speed - 0.1, 0.25);
            debouncedEffectsUpdate({ speed: newSpeed });
        }
    };
    const adjustment = adjustments[action];
    if (adjustment) {
        adjustment();
        showQuickAdjustmentFeedback(action);
    }
}

/**
 * Show visual feedback for quick adjustment
 */
function showQuickAdjustmentFeedback(action) {
    const button = document.querySelector(`[data-action="${action}"]`);
    if (button) {
        button.classList.add('feedback');
        setTimeout(() => {
            button.classList.remove('feedback');
        }, 200);
    }
}

/**
 * Initialize graphical EQ
 */
function initGraphicalEQ() {
    const eqContainer = document.getElementById('eq-graphical');
    if (!eqContainer) return;
    if (!eqTooltip) {
        eqTooltip = document.createElement('div');
        eqTooltip.className = 'eq-tooltip';
        eqContainer.appendChild(eqTooltip);
    }
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
        const fallback = document.getElementById('eq-fallback');
        if (fallback) fallback.style.display = 'flex';
        eqContainer.style.display = 'none';
        return;
    }
    const points = ['bass', 'mid', 'treble'];
    points.forEach(band => {
        const point = document.getElementById(`eq-point-${band}`);
        if (point) {
            point.addEventListener('mousedown', (e) => startEQDrag(e, band));
            point.addEventListener('mouseenter', (e) => showEQTooltip(e, band));
            point.addEventListener('mouseleave', () => hideEQTooltip());
        }
    });
    document.addEventListener('mousemove', handleEQDrag);
    document.addEventListener('mouseup', stopEQDrag);
    
    // Initialize spectrum toggle
    const spectrumToggle = document.getElementById('eq-spectrum-toggle');
    if (spectrumToggle) {
        spectrumToggle.addEventListener('click', toggleEQSpectrum);
        spectrumToggle.classList.toggle('active', eqSpectrumEnabled);
    }
    updateSpectrumVisibility();
    updateEQCurve();
    
    // Start spectrum animation loop
    startSpectrumAnimation();
}

/**
 * Start dragging EQ point
 */
function startEQDrag(e, band) {
    eqDragging = band;
    const point = e.target;
    point.classList.add('dragging');
    e.preventDefault();
}

/**
 * Handle EQ drag
 */
function handleEQDrag(e) {
    if (!eqDragging) return;
    const svg = document.querySelector('.eq-curve-svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const y = Math.max(10, Math.min(110, e.clientY - rect.top));
    const dbValue = Math.round(20 - ((y - 10) / 100) * 40);
    const eq = {
        bass: parseInt(document.getElementById('effect-eq-bass')?.value || 0),
        mid: parseInt(document.getElementById('effect-eq-mid')?.value || 0),
        treble: parseInt(document.getElementById('effect-eq-treble')?.value || 0)
    };
    eq[eqDragging] = dbValue;
    const slider = document.getElementById(`effect-eq-${eqDragging}`);
    if (slider) {
        slider.value = dbValue;
        slider.dispatchEvent(new Event('change'));
    }
    updateEQCurve();
    updateEQTooltip(dbValue, e.clientX, e.clientY);
}

/**
 * Stop dragging EQ point
 */
function stopEQDrag() {
    if (eqDragging) {
        const point = document.getElementById(`eq-point-${eqDragging}`);
        if (point) {
            point.classList.remove('dragging');
        }
        eqDragging = null;
    }
}

/**
 * Show EQ tooltip
 */
function showEQTooltip(e, band) {
    if (eqDragging) return;
    const slider = document.getElementById(`effect-eq-${band}`);
    const value = slider ? parseInt(slider.value) : 0;
    updateEQTooltip(value, e.clientX, e.clientY);
}

/**
 * Update EQ tooltip position and content
 */
function updateEQTooltip(value, x, y) {
    if (!eqTooltip) return;
    eqTooltip.textContent = `${value > 0 ? '+' : ''}${value}dB`;
    eqTooltip.classList.add('visible');
    if (x !== undefined && y !== undefined) {
        const rect = eqTooltip.parentElement.getBoundingClientRect();
        eqTooltip.style.left = `${x - rect.left + 10}px`;
        eqTooltip.style.top = `${y - rect.top - 10}px`;
    }
}

/**
 * Hide EQ tooltip
 */
function hideEQTooltip() {
    if (eqTooltip) {
        eqTooltip.classList.remove('visible');
    }
}

/**
 * Update EQ curve visualization
 */
function updateEQCurve() {
    const bass = parseInt(document.getElementById('effect-eq-bass')?.value || 0);
    const mid = parseInt(document.getElementById('effect-eq-mid')?.value || 0);
    const treble = parseInt(document.getElementById('effect-eq-treble')?.value || 0);
    const bassY = 60 - (bass / 20) * 50;
    const midY = 60 - (mid / 20) * 50;
    const trebleY = 60 - (treble / 20) * 50;
    const bassPoint = document.getElementById('eq-point-bass');
    const midPoint = document.getElementById('eq-point-mid');
    const treblePoint = document.getElementById('eq-point-treble');
    if (bassPoint) bassPoint.setAttribute('cy', bassY);
    if (midPoint) midPoint.setAttribute('cy', midY);
    if (treblePoint) treblePoint.setAttribute('cy', trebleY);
    const curvePath = document.getElementById('eq-curve-path');
    if (curvePath) {
        curvePath.setAttribute('d', `M0,60 L75,${bassY} L150,${midY} L225,${trebleY} L300,60`);
    }
    const fillPath = document.getElementById('eq-curve-fill');
    if (fillPath) {
        fillPath.setAttribute('d', `M0,120 L0,60 L75,${bassY} L150,${midY} L225,${trebleY} L300,60 L300,120 Z`);
    }
}

/**
 * Map frequency bin to X position on EQ display
 * EQ display shows 100Hz to 10kHz (logarithmic scale)
 * @param {number} binIndex - Frequency bin index (0 to bufferLength-1)
 * @param {number} bufferLength - Total number of frequency bins
 * @param {number} sampleRate - Audio sample rate (default 44100)
 * @returns {number} X position (0 to 300)
 */
function mapFrequencyToX(binIndex, bufferLength, sampleRate = 44100) {
    // Calculate actual frequency for this bin
    const nyquist = sampleRate / 2;
    const frequency = (binIndex / bufferLength) * nyquist;
    
    // Map to EQ range (100Hz to 10kHz) using logarithmic scale
    const minFreq = 100;
    const maxFreq = 10000;
    
    if (frequency < minFreq) return 0;
    if (frequency > maxFreq) return 300;
    
    // Logarithmic mapping
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const logFreq = Math.log10(frequency);
    const ratio = (logFreq - logMin) / (logMax - logMin);
    
    return ratio * 300;
}

/**
 * Update spectrum visualization
 */
function updateSpectrum() {
    if (!eqSpectrumEnabled || !audioDataArray || audioDataArray.length === 0) {
        return;
    }
    
    const spectrumPath = document.getElementById('eq-spectrum-path');
    const spectrumLine = document.getElementById('eq-spectrum-line');
    if (!spectrumPath || !spectrumLine) return;
    
    const bufferLength = audioDataArray.length;
    const sampleRate = 44100; // Standard sample rate
    const points = [];
    const linePoints = [];
    
    // Sample points across the frequency range
    const numPoints = 100; // Smooth curve
    for (let i = 0; i <= numPoints; i++) {
        const x = (i / numPoints) * 300;
        
        // Find corresponding frequency bin
        const targetFreq = Math.pow(10, Math.log10(100) + (Math.log10(10000) - Math.log10(100)) * (i / numPoints));
        const binIndex = Math.round((targetFreq / (sampleRate / 2)) * bufferLength);
        const clampedBin = Math.min(binIndex, bufferLength - 1);
        
        // Get amplitude (0-255, normalized to 0-1)
        const amplitude = audioDataArray[clampedBin] / 255;
        
        // Map to Y position (0 = top, 120 = bottom, 60 = center/0dB)
        // Show spectrum from bottom (120) up, with max at 0dB line (60)
        const maxHeight = 50; // Maximum height from center
        const y = 60 + (1 - amplitude) * maxHeight; // Invert so louder = higher
        
        points.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
        linePoints.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
    }
    
    // Close the fill path
    const pathData = points.join(' ') + ` L300,120 L0,120 Z`;
    const lineData = linePoints.join(' ');
    
    spectrumPath.setAttribute('d', pathData);
    spectrumLine.setAttribute('d', lineData);
}

/**
 * Start spectrum animation loop
 */
function startSpectrumAnimation() {
    // Don't start multiple animation loops
    if (spectrumAnimationFrame !== null) {
        return;
    }
    function animate() {
        if (eqSpectrumEnabled) {
            updateSpectrum();
        }
        spectrumAnimationFrame = requestAnimationFrame(animate);
    }
    animate();
}

/**
 * Stop spectrum animation loop
 */
function stopSpectrumAnimation() {
    if (spectrumAnimationFrame) {
        cancelAnimationFrame(spectrumAnimationFrame);
        spectrumAnimationFrame = null;
    }
}

/**
 * Toggle spectrum visualization
 */
function toggleEQSpectrum() {
    eqSpectrumEnabled = !eqSpectrumEnabled;
    localStorage.setItem('wabisaby_eq_spectrum_enabled', eqSpectrumEnabled.toString());
    
    const toggle = document.getElementById('eq-spectrum-toggle');
    if (toggle) {
        toggle.classList.toggle('active', eqSpectrumEnabled);
    }
    
    updateSpectrumVisibility();
    
    if (eqSpectrumEnabled) {
        startSpectrumAnimation();
    } else {
        // Clear spectrum when disabled
        const spectrumPath = document.getElementById('eq-spectrum-path');
        const spectrumLine = document.getElementById('eq-spectrum-line');
        if (spectrumPath) spectrumPath.setAttribute('d', '');
        if (spectrumLine) spectrumLine.setAttribute('d', '');
    }
}

/**
 * Update spectrum visibility
 */
function updateSpectrumVisibility() {
    const spectrumLayer = document.getElementById('eq-spectrum-layer');
    if (spectrumLayer) {
        spectrumLayer.style.opacity = eqSpectrumEnabled ? '1' : '0';
    }
}

/**
 * Render effects presets
 */
function renderEffectsPresets(presets, activePreset) {
    const container = document.getElementById('effects-presets-grid');
    if (!container) return;

    container.innerHTML = presets.map(preset => `
        <button class="effects-preset-btn ${preset.id === activePreset ? 'active' : ''}" 
                onclick="applyEffectsPreset('${preset.id}')"
                data-preset-id="${preset.id}">
            <i class="fas ${preset.icon || 'fa-music'} preset-icon"></i>
            <span class="preset-name">${preset.name}</span>
        </button>
    `).join('');
}

/**
 * Highlight active preset
 */
function highlightActivePreset(presetId) {
    document.querySelectorAll('.effects-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.presetId === presetId);
    });
}

/**
 * Update current preset display
 */
function updateCurrentPresetDisplay(presetId) {
    const display = document.getElementById('effects-current-preset');
    if (display) {
        const preset = effectsPresets.find(p => p.id === presetId);
        display.textContent = preset ? preset.name : 'Custom';
    }
}

/**
 * Show effects save indicator
 */
function showEffectsSaveIndicator() {
    const indicator = document.getElementById('effects-save-indicator');
    if (indicator) {
        indicator.classList.add('visible');
        setTimeout(() => {
            indicator.classList.remove('visible');
        }, 2000);
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

/**
 * Initialize effects listeners
 */
function initEffectsListeners() {
    // Restore saved mode preference
    restoreEffectsMode();
    
    // Subscribe to audio data for spectrum visualization
    effectsBroadcast.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'AUDIO_DATA' && msg.data) {
            audioDataArray = new Uint8Array(msg.data);
        }
    });
    
    // Mode toggle
    const modeToggle = document.getElementById('effects-mode-toggle');
    if (modeToggle) {
        modeToggle.addEventListener('click', toggleEffectsMode);
    }

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

    // Speed slider (advanced mode only)
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

    // EQ sliders (advanced mode only)
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
                // Update EQ curve if in advanced mode
                if (effectsMode === 'advanced') {
                    updateEQCurve();
                }
            });
            slider.addEventListener('change', () => {
                const eq = {
                    bass: parseInt(document.getElementById('effect-eq-bass')?.value || 0),
                    mid: parseInt(document.getElementById('effect-eq-mid')?.value || 0),
                    treble: parseInt(document.getElementById('effect-eq-treble')?.value || 0)
                };
                debouncedEffectsUpdate({ eq });
            });
        }
    });

    // Quick adjustment buttons
    document.getElementById('effects-quick-adjustments')?.addEventListener('click', (e) => {
        if (e.target.closest('.quick-adjust-btn')) {
            const action = e.target.closest('.quick-adjust-btn').dataset.action;
            if (action) {
                handleQuickAdjustment(action);
            }
        }
    });

    // Simple mode doesn't have intensity sliders - only quick adjustments

    // Advanced mode intensity sliders
    ['reverb', 'echo', 'distortion', 'compressor'].forEach(effectName => {
        const intensitySlider = document.getElementById(`effect-${effectName}-intensity-adv`);
        if (intensitySlider) {
            intensitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                const valueDisplay = document.getElementById(`effect-${effectName}-intensity-value-adv`);
                if (valueDisplay) {
                    valueDisplay.textContent = `${value}%`;
                }
            });
            intensitySlider.addEventListener('change', (e) => {
                handleEffectIntensityChange(effectName, parseInt(e.target.value));
            });
        }
    });

    // Advanced controls buttons
    document.addEventListener('click', (e) => {
        if (e.target.closest('.effect-advanced-btn')) {
            const effectName = e.target.closest('.effect-advanced-btn').dataset.effect;
            if (effectName) {
                toggleEffectAdvanced(effectName);
            }
        }
    });

    // Effect card toggles and sliders (advanced mode)
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

// Make functions globally available
window.applyEffectsPreset = applyEffectsPreset;
window.resetAllEffects = resetAllEffects;

