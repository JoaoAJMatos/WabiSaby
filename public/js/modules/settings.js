/**
 * Settings Management Module
 * Handles settings modal, loading, saving, and search functionality
 */

let settingsSaveTimeout = null;
let diskUsagePollInterval = null;

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
        const shuffleEnabledEl = document.getElementById('setting-shuffleEnabled');
        if (shuffleEnabledEl) {
            shuffleEnabledEl.checked = settings.playback.shuffleEnabled || false;
        }
        const repeatModeEl = document.getElementById('setting-repeatMode');
        if (repeatModeEl) {
            repeatModeEl.value = settings.playback.repeatMode || 'off';
        }
        document.getElementById('setting-songTransitionDelay').value = settings.playback.songTransitionDelay;
        
        // Populate performance settings
        document.getElementById('setting-prefetchNext').checked = settings.performance.prefetchNext;
        document.getElementById('setting-prefetchCount').value = settings.performance.prefetchCount;
        
        // Populate notification settings
        document.getElementById('setting-notificationsEnabled').checked = settings.notifications.enabled;
        document.getElementById('setting-notifyAtPosition').value = settings.notifications.notifyAtPosition;
        
        // Populate language setting (from localStorage or browser)
        const languageSelect = document.getElementById('setting-language');
        if (languageSelect && window.i18n) {
            const currentLang = window.i18n.getLanguage() || window.i18n.detectLanguage();
            languageSelect.value = currentLang;
        }
        
        // Populate privacy settings
        const demoModeEl = document.getElementById('setting-demoMode');
        if (demoModeEl) {
            const demoMode = settings.privacy?.demoMode || false;
            demoModeEl.checked = demoMode;
            applyDemoMode(demoMode);
        }
        
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

function applyDemoMode(enabled) {
    const body = document.body;
    if (enabled) {
        body.classList.add('demo-mode');
    } else {
        body.classList.remove('demo-mode');
    }
}

async function updateSettingsValue(category, key, value) {
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
        
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`HTTP ${res.status}: ${errorText}`);
        }
        
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
        
        // Update local state for shuffle enabled (managed in dashboard.js)
        if (category === 'playback' && key === 'shuffleEnabled') {
            // Update the shuffleEnabled variable in dashboard.js
            if (typeof shuffleEnabled !== 'undefined') {
                shuffleEnabled = value;
            }
            // Update the shuffle button state
            if (typeof updateShuffleButtonState === 'function') {
                updateShuffleButtonState();
            }
            // Refresh queue to update position display
            if (typeof fetchData === 'function') {
                fetchData();
            }
        }
        
        // Handle privacy demo mode changes
        if (category === 'privacy' && key === 'demoMode') {
            applyDemoMode(value);
            // Refresh UI elements to ensure blur is applied to dynamically loaded content
            setTimeout(() => {
                if (typeof fetchPriorityUsers === 'function') fetchPriorityUsers();
                if (typeof loadGroups === 'function') loadGroups();
                if (typeof fetchData === 'function') fetchData();
            }, 100);
        }
        
        if (settingRow) {
            settingRow.classList.remove('saving');
            settingRow.classList.add('saved');
            setTimeout(() => settingRow.classList.remove('saved'), 1500);
        }
        
        // Show save indicator
        showSaveIndicator();
        
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
    
    // Update main header with panel info
    const activePanel = document.querySelector(`.settings-panel[data-panel="${category}"]`);
    if (activePanel) {
        const panelHeader = activePanel.querySelector('.panel-header');
        if (panelHeader) {
            const panelIcon = panelHeader.querySelector('.panel-icon');
            const panelTitle = panelHeader.querySelector('.panel-title');
            
            const headerIcon = document.getElementById('settings-main-header-icon');
            const headerTitle = document.getElementById('settings-main-header-title');
            
            if (headerIcon && panelIcon) {
                // Copy icon classes and content
                headerIcon.className = panelIcon.className;
                headerIcon.innerHTML = panelIcon.innerHTML;
            }
            
            if (headerTitle && panelTitle) {
                // Copy title content
                headerTitle.innerHTML = panelTitle.innerHTML;
            }
        }
    }
    
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
    
    // Start/stop disk usage polling when switching to/from system panel
    if (category === 'system') {
        startDiskUsagePolling();
    } else {
        stopDiskUsagePolling();
    }
    
    // Load volume normalization settings when switching to audio panel
    if (category === 'audio') {
        if (window.volumeNormalization && typeof window.volumeNormalization.loadSettings === 'function') {
            window.volumeNormalization.loadSettings();
        }
        // Start RMS monitoring when switching to audio panel
        if (window.volumeNormalization && typeof window.volumeNormalization.startRMSMonitoring === 'function') {
            window.volumeNormalization.startRMSMonitoring();
        }
    } else {
        // Stop RMS monitoring when switching away from audio panel
        if (window.volumeNormalization && typeof window.volumeNormalization.stopRMSMonitoring === 'function') {
            window.volumeNormalization.stopRMSMonitoring();
        }
    }
    
    // Clear search when switching panels (but not when switching to search-results)
    if (category !== 'search-results') {
        const searchInput = document.getElementById('settings-search');
        if (searchInput && searchInput.value) {
            searchInput.value = '';
            const clearBtn = document.getElementById('settings-search-clear');
            if (clearBtn) clearBtn.classList.add('hidden');
        }
    }
}

function startDiskUsagePolling() {
    // Load immediately
    loadDiskUsage();
    
    // Then poll every 5 seconds
    if (diskUsagePollInterval) {
        clearInterval(diskUsagePollInterval);
    }
    diskUsagePollInterval = setInterval(() => {
        loadDiskUsage(true); // Pass true to indicate it's a refresh (preserve expanded state)
    }, 5000);
}

function stopDiskUsagePolling() {
    if (diskUsagePollInterval) {
        clearInterval(diskUsagePollInterval);
        diskUsagePollInterval = null;
    }
}

// Make stopDiskUsagePolling globally accessible for modals.js
window.stopDiskUsagePolling = stopDiskUsagePolling;

async function loadDiskUsage(isRefresh = false) {
    const container = document.getElementById('disk-usage-container');
    if (!container) return;
    
    // Check if elements already exist (for refresh)
    const existingSummaryValue = container.querySelector('.disk-usage-summary-value');
    const existingDetails = container.querySelector('.disk-usage-details');
    const wasExpanded = existingDetails && existingDetails.style.display !== 'none';
    
    // Only show loading state on first load, not on refresh
    if (!isRefresh) {
        container.innerHTML = `
            <div class="disk-usage-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Loading disk usage...</span>
            </div>
        `;
    }
    
    try {
        const res = await fetch('/api/settings/disk-usage');
        if (!res.ok) throw new Error('Failed to fetch disk usage');
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to get disk usage');
        
        const { usage } = data;
        
        // If elements exist, just update values (refresh)
        if (isRefresh && existingSummaryValue) {
            // Update summary value
            const summaryValue = container.querySelector('.disk-usage-summary-value');
            if (summaryValue) {
                summaryValue.textContent = usage.total.formatted;
            }
            
            // Update detail values
            const detailValues = container.querySelectorAll('.disk-usage-item .disk-usage-value');
            if (detailValues.length >= 6) {
                detailValues[0].textContent = usage.database.formatted;
                detailValues[1].textContent = usage.temp.formatted;
                detailValues[2].textContent = usage.media.formatted;
                detailValues[3].textContent = usage.thumbnails.formatted;
                detailValues[4].textContent = usage.data.formatted;
                detailValues[5].textContent = usage.auth.formatted;
            }
            return; // Exit early, no need to rerender
        }
        
        // Render full structure on first load
        container.innerHTML = `
            <div class="disk-usage-compact">
                <div class="disk-usage-summary">
                    <div class="disk-usage-summary-icon">
                        <i class="fas fa-hdd"></i>
                    </div>
                    <div class="disk-usage-summary-info">
                        <div class="disk-usage-summary-label">Total Storage</div>
                        <div class="disk-usage-summary-value">${usage.total.formatted}</div>
                    </div>
                    <button class="disk-usage-expand-btn" id="disk-usage-expand-btn" title="Show details">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
            </div>
            <div class="disk-usage-details" id="disk-usage-details" style="display: ${wasExpanded ? 'block' : 'none'};">
                <div class="disk-usage-grid">
                    <div class="disk-usage-item">
                        <div class="disk-usage-label">
                            <i class="fas fa-database"></i>
                            <span>Database</span>
                        </div>
                        <div class="disk-usage-value">${usage.database.formatted}</div>
                    </div>
                    <div class="disk-usage-item">
                        <div class="disk-usage-label">
                            <i class="fas fa-file-alt"></i>
                            <span>Temp Files</span>
                        </div>
                        <div class="disk-usage-value">${usage.temp.formatted}</div>
                    </div>
                    <div class="disk-usage-item">
                        <div class="disk-usage-label">
                            <i class="fas fa-music"></i>
                            <span>Media</span>
                        </div>
                        <div class="disk-usage-value">${usage.media.formatted}</div>
                    </div>
                    <div class="disk-usage-item">
                        <div class="disk-usage-label">
                            <i class="fas fa-image"></i>
                            <span>Thumbnails</span>
                        </div>
                        <div class="disk-usage-value">${usage.thumbnails.formatted}</div>
                    </div>
                    <div class="disk-usage-item">
                        <div class="disk-usage-label">
                            <i class="fas fa-folder"></i>
                            <span>Data Files</span>
                        </div>
                        <div class="disk-usage-value">${usage.data.formatted}</div>
                    </div>
                    <div class="disk-usage-item">
                        <div class="disk-usage-label">
                            <i class="fas fa-key"></i>
                            <span>Auth</span>
                        </div>
                        <div class="disk-usage-value">${usage.auth.formatted}</div>
                    </div>
                </div>
            </div>
        `;
        
        // Add expand/collapse functionality
        const expandBtn = document.getElementById('disk-usage-expand-btn');
        const detailsEl = document.getElementById('disk-usage-details');
        const summary = container.querySelector('.disk-usage-summary');
        
        if (expandBtn && detailsEl && summary) {
            // Function to toggle expand/collapse
            const toggleDetails = () => {
                const isExpanded = detailsEl.style.display !== 'none';
                detailsEl.style.display = isExpanded ? 'none' : 'block';
                expandBtn.querySelector('i').classList.toggle('fa-chevron-down', !isExpanded);
                expandBtn.querySelector('i').classList.toggle('fa-chevron-up', isExpanded);
                expandBtn.title = isExpanded ? 'Show details' : 'Hide details';
                // Toggle expanded class based on new state (after toggle)
                container.classList.toggle('expanded', !isExpanded);
            };
            
            // Update icon and container class based on current state
            if (wasExpanded) {
                expandBtn.querySelector('i').classList.remove('fa-chevron-down');
                expandBtn.querySelector('i').classList.add('fa-chevron-up');
                expandBtn.title = 'Hide details';
                container.classList.add('expanded');
            } else {
                container.classList.remove('expanded');
            }
            
            // Make entire summary clickable
            summary.addEventListener('click', (e) => {
                // Don't trigger if clicking directly on the button (let button handle it)
                if (e.target.closest('.disk-usage-expand-btn')) {
                    return;
                }
                toggleDetails();
            });
            
            // Button click handler (stop propagation to avoid double-trigger)
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleDetails();
            });
        }
    } catch (err) {
        console.error('Failed to load disk usage:', err);
        if (!isRefresh) {
            container.innerHTML = `
                <div class="disk-usage-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>Failed to load disk usage information</span>
                </div>
            `;
        }
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
    
    // Update UI with translation
    let countText;
    if (window.i18n && window.i18n.tSync) {
        countText = window.i18n.tSync('ui.dashboard.settings.search.settingsFound', { count: matches.length });
    } else {
        countText = `${matches.length} setting${matches.length !== 1 ? 's' : ''} found`;
    }
    if (countEl) {
        countEl.textContent = countText;
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
    switchSettingsPanel('search-results');
    
    // Update header count after panel switch
    const headerTitle = document.getElementById('settings-main-header-title');
    if (headerTitle) {
        const headerCountEl = headerTitle.querySelector('p');
        if (headerCountEl) {
            headerCountEl.textContent = countText;
        }
    }
}

function rebindSettingRowListeners(container) {
    // Rebind toggle switches
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const category = e.target.dataset.category;
            const key = e.target.dataset.key;
            if (category && key) {
                updateSettingsValue(category, key, e.target.checked);
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
                updateSettingsValue(category, key, e.target.value);
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
                    updateSettingsValue(category, key, value);
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
    const resetTitle = window.i18n?.tSync('ui.dashboard.settings.footer.resetAllConfirmTitle') || 'Reset All Settings';
    const resetMessage = window.i18n?.tSync('ui.dashboard.settings.footer.resetAllConfirmMessage') || 'Are you sure you want to reset all settings to their default values? This cannot be undone.';
    showConfirmationModal({
        title: resetTitle,
        message: resetMessage,
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
        select.addEventListener('change', async (e) => {
            const category = e.target.dataset.category;
            const key = e.target.dataset.key;
            
            // Special handling for language setting
            if (category === 'user' && key === 'language' && window.i18n) {
                const newLang = e.target.value;
                await window.i18n.setLanguage(newLang);
                
                // Show save indicator
                const settingRow = e.target.closest('.setting-row');
                if (settingRow) {
                    settingRow.classList.add('saved');
                    setTimeout(() => settingRow.classList.remove('saved'), 1500);
                }
                showSaveIndicator();
                
                // Update dashboard translations dynamically (no page reload needed)
                if (typeof updateDashboardTranslations === 'function') {
                    updateDashboardTranslations();
                }
                
                // The languageChanged event is already dispatched by i18n.setLanguage()
                // which will trigger the updateDashboardTranslations() in dashboard.js
                return;
            }
            
            if (category && key) {
                updateSettingsValue(category, key, e.target.value);
            }
        });
    });
    
    // Handle all checkbox changes (toggle switches) - use event delegation
    const settingsModalEl = document.getElementById('settings-modal');
    if (settingsModalEl) {
        settingsModalEl.addEventListener('change', async (e) => {
            if (e.target.type === 'checkbox' && e.target.closest('#settings-modal')) {
                const category = e.target.dataset.category;
                const key = e.target.dataset.key;
                const checked = e.target.checked;
                
                if (category && key) {
                    try {
                        await updateSettingsValue(category, key, checked);
                    } catch (error) {
                        console.error('Error updating setting:', error);
                    }
                }
            }
        });
    }
    
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
                    updateSettingsValue(category, key, value);
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
            updateSettingsValue('download', 'audioQuality', value);
        });
    }
    
    // Client selector radios
    document.querySelectorAll('input[name="playerClient"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.getElementById('setting-playerClient').value = e.target.value;
                updateSettingsValue('download', 'playerClient', e.target.value);
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

