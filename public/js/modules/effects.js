/**
 * Audio Effects Module
 * Handles audio effects management and presets
 */

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
 * Render effects presets
 */
function renderEffectsPresets(presets, activePreset) {
    const container = document.getElementById('effects-presets');
    if (!container) return;
    
    container.innerHTML = presets.map(preset => `
        <button class="effects-preset-btn ${preset.id === activePreset ? 'active' : ''}" 
                onclick="applyEffectsPreset('${preset.id}')"
                data-preset-id="${preset.id}">
            <span class="preset-name">${preset.name}</span>
            <span class="preset-desc">${preset.description || ''}</span>
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

// Make functions globally available
window.applyEffectsPreset = applyEffectsPreset;
window.resetAllEffects = resetAllEffects;

