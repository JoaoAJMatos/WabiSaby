/**
 * Settings Management Module
 * Handles settings modal, loading, saving, and search functionality
 */

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
            // Note: skipConfirmationEnabled is managed in queue.js
        }
        const showRequesterNameEl = document.getElementById('setting-showRequesterName');
        if (showRequesterNameEl) {
            showRequesterNameEl.checked = settings.playback.showRequesterName;
            // Note: showRequesterNameEnabled is managed in queue.js
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
        
        // Update local state for skip confirmation (managed in queue.js)
        if (category === 'playback' && key === 'confirmSkip') {
            if (typeof skipConfirmationEnabled !== 'undefined') {
                skipConfirmationEnabled = value;
            }
        }
        
        // Update local state for show requester name (managed in queue.js)
        if (category === 'playback' && key === 'showRequesterName') {
            if (typeof showRequesterNameEnabled !== 'undefined') {
                showRequesterNameEnabled = value;
            }
            // Refresh current song display to apply change immediately
            if (typeof localCurrentSong !== 'undefined' && localCurrentSong) {
                if (typeof updateQueueUI === 'function') {
                    updateQueueUI({ queue: [], currentSong: localCurrentSong });
                }
            }
            // Broadcast settings update to player view
            if (typeof broadcast !== 'undefined') {
                broadcast.postMessage({
                    type: 'SETTINGS_UPDATE',
                    settings: { playback: { showRequesterName: value } }
                });
            }
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

// Make switchSettingsPanel globally accessible for modals.js
window.switchSettingsPanel = function switchSettingsPanel(category) {
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
        if (typeof loadGroups === 'function') {
            loadGroups();
        }
    } else {
        // Stop polling when switching away from groups panel
        if (typeof stopPendingConfirmationsPolling === 'function') {
            stopPendingConfirmationsPolling();
        }
    }
    
    // Clear search when switching panels
    const searchInput = document.getElementById('settings-search');
    if (searchInput && searchInput.value) {
        searchInput.value = '';
        const clearBtn = document.getElementById('settings-search-clear');
        if (clearBtn) clearBtn.classList.add('hidden');
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
        if (clearBtn) {
            clearBtn.classList.toggle('hidden', !query);
        }
        
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            if (query.length >= 2) {
                performSettingsSearch(query);
            } else if (query.length === 0) {
                exitSearchMode();
            }
        }, 200);
    });
    
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.classList.add('hidden');
            exitSearchMode();
            searchInput.focus();
        });
    }
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
    if (countEl) {
        countEl.textContent = `${matches.length} setting${matches.length !== 1 ? 's' : ''} found`;
    }
    
    if (matches.length > 0) {
        if (noResultsEl) noResultsEl.classList.add('hidden');
        matches.forEach(match => {
            match.classList.add('highlight');
            resultsContainer.appendChild(match);
        });
        
        // Rebind listeners for cloned elements
        rebindSettingRowListeners(resultsContainer);
    } else {
        if (noResultsEl) noResultsEl.classList.remove('hidden');
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
    
    // Groups management (will be handled by groups module)
    const addGroupForm = document.getElementById('add-group-form');
    if (addGroupForm) {
        addGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('group-id-input');
            const groupId = input.value.trim();
            if (groupId && typeof addGroup === 'function') {
                await addGroup(groupId);
                input.value = '';
            }
        });
    }
    
    // Settings modal open/close listeners
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', openSettingsModal);
    }
    const settingsModalClose = document.getElementById('settings-modal-close');
    if (settingsModalClose) {
        settingsModalClose.addEventListener('click', closeSettingsModal);
    }
    
    // Close modal when clicking on overlay background
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target.id === 'settings-modal') {
                closeSettingsModal();
            }
        });
    }
    
    // Close modals on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSettingsModal();
            closeAddTrackModal();
            closeConfirmationModal();
        }
    });
}

