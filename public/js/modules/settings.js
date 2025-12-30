/**
 * Settings Management Module
 * Handles settings modal, loading, saving, and search functionality
 */

let settingsSaveTimeout = null;
let diskUsagePollInterval = null;
let settingsSSEConnection = null;
let countdownTimerInterval = null;

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
        
        // Populate rate limit settings
        if (settings.rateLimit) {
            const rateLimitEnabledEl = document.getElementById('setting-rateLimitEnabled');
            if (rateLimitEnabledEl) {
                rateLimitEnabledEl.checked = settings.rateLimit.enabled !== false;
            }
            const rateLimitMaxRequestsEl = document.getElementById('setting-rateLimitMaxRequests');
            if (rateLimitMaxRequestsEl) {
                rateLimitMaxRequestsEl.value = settings.rateLimit.maxRequests || 3;
            }
            const rateLimitWindowSecondsEl = document.getElementById('setting-rateLimitWindowSeconds');
            if (rateLimitWindowSecondsEl) {
                rateLimitWindowSecondsEl.value = settings.rateLimit.windowSeconds || 60;
            }
        }

        // Populate countdown settings
        if (settings.countdown) {
            const countdownEnabledEl = document.getElementById('setting-countdownEnabled');
            if (countdownEnabledEl) {
                countdownEnabledEl.checked = settings.countdown.enabled || false;
            }
            
            // Handle split date/time inputs
            if (settings.countdown.targetDate) {
                const date = new Date(settings.countdown.targetDate);
                const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
                const dateStr = localDate.toISOString().slice(0, 10);
                const timeStr = localDate.toTimeString().slice(0, 5);
                
                const countdownTargetDateEl = document.getElementById('setting-countdownTargetDate');
                if (countdownTargetDateEl) {
                    countdownTargetDateEl.value = dateStr;
                    // Update label position
                    setTimeout(() => {
                        const wrapper = countdownTargetDateEl.closest('.datetime-input-wrapper');
                        if (wrapper && countdownTargetDateEl.value) {
                            wrapper.classList.add('has-value');
                        }
                    }, 0);
                }
                const countdownTargetTimeEl = document.getElementById('setting-countdownTargetTime');
                if (countdownTargetTimeEl) {
                    countdownTargetTimeEl.value = timeStr;
                    // Update label position
                    setTimeout(() => {
                        const wrapper = countdownTargetTimeEl.closest('.datetime-input-wrapper');
                        if (wrapper && countdownTargetTimeEl.value) {
                            wrapper.classList.add('has-value');
                        }
                    }, 0);
                }
            }
            
            // Show threshold dropdown
            const countdownShowThresholdEl = document.getElementById('setting-countdownShowThreshold');
            const countdownShowThresholdCustomEl = document.getElementById('setting-countdownShowThresholdCustom');
            const threshold = settings.countdown.showThreshold || 30;
            if (countdownShowThresholdEl) {
                if (threshold === 10 || threshold === 30 || threshold === 60) {
                    countdownShowThresholdEl.value = threshold;
                } else {
                    countdownShowThresholdEl.value = 'custom';
                    if (countdownShowThresholdCustomEl) {
                        countdownShowThresholdCustomEl.value = threshold;
                        countdownShowThresholdCustomEl.style.display = 'inline-block';
                    }
                }
            }
            
            const countdownMessageEl = document.getElementById('setting-countdownMessage');
            if (countdownMessageEl) {
                countdownMessageEl.value = settings.countdown.message || 'Happy New Year! 🎉';
            }
            
            const countdownMessageDurationEl = document.getElementById('setting-countdownMessageDuration');
            if (countdownMessageDurationEl) {
                countdownMessageDurationEl.value = settings.countdown.messageDisplayDuration || 30;
            }
            
            // Update message preview
            updateMessagePreview();
            
            // Song configuration
            const countdownSongUrlEl = document.getElementById('setting-countdownSongUrl');
            if (countdownSongUrlEl && settings.countdown.song) {
                countdownSongUrlEl.value = settings.countdown.song.url || '';
            }
            
            // Convert timestamp from seconds to MM:SS format
            const countdownSongTimestampEl = document.getElementById('setting-countdownSongTimestamp');
            if (countdownSongTimestampEl && settings.countdown.song) {
                const seconds = settings.countdown.song.timestamp || 0;
                const minutes = Math.floor(seconds / 60);
                const secs = seconds % 60;
                countdownSongTimestampEl.value = `${minutes}:${secs.toString().padStart(2, '0')}`;
            }

            // Initialize waveform if song URL is set
            if (settings.countdown.song?.url && window.countdownWaveform) {
                // Small delay to ensure DOM is ready
                setTimeout(() => {
                    window.countdownWaveform.init();
                    window.countdownWaveform.triggerLoad();
                }, 200);
            }
        }

        // Connect to SSE for countdown status updates
        connectSettingsSSE();
        
        // Also update immediately after a short delay to ensure DOM is ready
        setTimeout(() => {
            updateCountdownStatus();
            // Also update song info on initial load
            const songUrl = document.getElementById('setting-countdownSongUrl')?.value?.trim();
            if (songUrl) {
                updateWaveformSongInfo(null, songUrl);
            }
        }, 100);

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
        const headerIcon = document.getElementById('settings-main-header-icon');
        const headerTitle = document.getElementById('settings-main-header-title');
        
        if (panelHeader) {
            // Standard panel with header
            const panelIcon = panelHeader.querySelector('.panel-icon');
            const panelTitle = panelHeader.querySelector('.panel-title');
            
            if (headerIcon && panelIcon) {
                // Copy icon classes and content
                headerIcon.className = panelIcon.className;
                headerIcon.innerHTML = panelIcon.innerHTML;
            }
            
            if (headerTitle && panelTitle) {
                // Copy title content
                headerTitle.innerHTML = panelTitle.innerHTML;
            }
        } else if (category === 'countdown') {
            // Special handling for countdown panel (no panel-header)
            if (headerIcon) {
                headerIcon.className = 'panel-icon countdown';
                headerIcon.innerHTML = '<i class="fas fa-hourglass-half"></i>';
            }
            
            if (headerTitle) {
                headerTitle.innerHTML = '<h3>Event Countdown</h3><p>Sync a song to a special moment with a countdown overlay</p>';
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

    // Initialize waveform when switching to countdown panel
    if (category === 'countdown') {
        const songUrl = document.getElementById('setting-countdownSongUrl')?.value?.trim();
        if (window.countdownWaveform) {
            // Small delay to ensure panel is visible before initializing
            setTimeout(async () => {
                // Always initialize to ensure canvas is sized correctly
                window.countdownWaveform.init();
                
                if (songUrl) {
                    // Check current status first - waveform might already be ready
                    try {
                        const statusRes = await fetch('/api/countdown');
                        if (statusRes.ok) {
                            const statusData = await statusRes.json();
                            if (statusData.success && statusData.countdown) {
                                const countdown = statusData.countdown;
                                
                                // If waveform is ready, load it immediately
                                if (countdown.waveformReady && !window.countdownWaveform.isReady()) {
                                    console.debug('Panel open: Waveform is ready, loading immediately...');
                                    await window.countdownWaveform.handleWaveformReady();
                                    return;
                                } else if (countdown.waveformReady && window.countdownWaveform.isReady()) {
                                    console.debug('Panel open: Waveform already loaded, re-rendering...');
                                    window.countdownWaveform.render();
                                    return;
                                } else {
                                    console.debug('Panel open: Waveform not ready yet:', {
                                        waveformReady: countdown.waveformReady,
                                        waveformInProgress: countdown.waveformInProgress
                                    });
                                }
                            }
                        }
                    } catch (e) {
                        console.debug('Failed to check countdown status:', e);
                    }
                    
                    // Only trigger load if not already ready and not currently loading
                    if (!window.countdownWaveform.isReady()) {
                        // Check if container is in loading state - if so, don't trigger again
                        const container = document.getElementById('countdown-waveform-container');
                        const isCurrentlyLoading = container?.classList.contains('loading');
                        
                        // Only trigger if not already loading (to prevent duplicate requests)
                        if (!isCurrentlyLoading) {
                            window.countdownWaveform.triggerLoad();
                        }
                    } else {
                        // Re-render in case of resize
                        window.countdownWaveform.render();
                    }
                } else {
                    // No song URL - show initial state
                    if (window.countdownWaveform.showInitialState) {
                        window.countdownWaveform.showInitialState();
                    }
                }
            }, 100);
        }
    }
}

function startDiskUsagePolling() {
    // Load immediately
    loadDiskUsage();
    
    // Then poll every 30 seconds
    if (diskUsagePollInterval) {
        clearInterval(diskUsagePollInterval);
    }
    diskUsagePollInterval = setInterval(() => {
        loadDiskUsage(true); // Pass true to indicate it's a refresh (preserve expanded state)
    }, 30000);
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

    // Initialize countdown settings handlers
    initCountdownSettingsHandlers();
}

// ============================================ 
// COUNTDOWN SETTINGS
// ============================================

/**
 * Connect to SSE stream for countdown status updates
 */
function connectSettingsSSE() {
    // Close existing connection if any
    if (settingsSSEConnection) {
        settingsSSEConnection.close();
        settingsSSEConnection = null;
    }

    // Connect to status stream
    settingsSSEConnection = new EventSource('/api/status/stream');

    settingsSSEConnection.onopen = () => {
        console.debug('Settings SSE connection opened');
    };

    settingsSSEConnection.onerror = () => {
        console.warn('Settings SSE connection error, will reconnect...');
        // Try to reconnect after 3 seconds
        setTimeout(() => {
            if (settingsSSEConnection && settingsSSEConnection.readyState === EventSource.CLOSED) {
                connectSettingsSSE();
            }
        }, 3000);
    };

    settingsSSEConnection.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.debug('Settings SSE message received:', data);
            
            // Update countdown status from SSE
            if (data.countdown) {
                console.debug('Countdown status in SSE:', data.countdown);
                handleCountdownStatusUpdate(data.countdown);
            }
        } catch (e) {
            console.error('Failed to parse settings SSE data:', e);
        }
    };
}

/**
 * Handle countdown status update from SSE
 */
function handleCountdownStatusUpdate(countdown) {
    console.debug('handleCountdownStatusUpdate called:', {
        waveformReady: countdown.waveformReady,
        waveformInProgress: countdown.waveformInProgress,
        songPrefetched: countdown.songPrefetched
    });
    
    // Update countdown status display
    updateCountdownStatusFromData(countdown);
    
    // Check if waveform is ready and update waveform if needed
    if (countdown.waveformReady && window.countdownWaveform) {
        console.debug('Waveform is ready, checking if already loaded...');
        // Check if waveform is not already loaded
        if (!window.countdownWaveform.isReady()) {
            console.debug('SSE: Waveform is ready, triggering load');
            // Waveform is ready, fetch it
            window.countdownWaveform.handleWaveformReady().catch(err => {
                console.error('Failed to load waveform from SSE update:', err);
            });
        } else {
            console.debug('Waveform already loaded, skipping');
        }
    } else if (!countdown.waveformReady) {
        console.debug('Waveform not ready yet:', {
            waveformReady: countdown.waveformReady,
            waveformInProgress: countdown.waveformInProgress
        });
    }
}

/**
 * Update countdown status display from data object
 */
function updateCountdownStatusFromData(countdown) {
    const statusText = document.getElementById('countdown-status-text');
    const timeRemaining = document.getElementById('countdown-time-remaining');
    
    if (!statusText || !timeRemaining) return;
    
    if (!countdown.enabled) {
        statusText.textContent = 'Countdown is disabled';
        timeRemaining.textContent = '--:--:--';
        timeRemaining.classList.remove('active');
        stopCountdownTimerPolling();
    } else if (!countdown.targetDate) {
        statusText.textContent = 'No target date configured';
        timeRemaining.textContent = '--:--:--';
        timeRemaining.classList.remove('active');
        stopCountdownTimerPolling();
    } else if (countdown.timeRemaining !== null && countdown.timeRemaining > 0) {
        statusText.textContent = 'Countdown is active';
        timeRemaining.textContent = countdown.formattedTime || formatTimeRemaining(countdown.timeRemaining);
        timeRemaining.classList.add('active');
        startCountdownTimerPolling();
    } else {
        statusText.textContent = 'Countdown has completed';
        timeRemaining.textContent = '00:00:00';
        timeRemaining.classList.remove('active');
        stopCountdownTimerPolling();
    }
    
    // Update song metadata in waveform header
    updateWaveformSongInfo(countdown.songMetadata, countdown.song?.url);
}

/**
 * Start polling for countdown timer updates
 */
function startCountdownTimerPolling() {
    // Clear existing interval if any
    stopCountdownTimerPolling();
    
    // Update every second
    countdownTimerInterval = setInterval(() => {
        updateCountdownStatus();
    }, 1000);
}

/**
 * Stop polling for countdown timer updates
 */
function stopCountdownTimerPolling() {
    if (countdownTimerInterval) {
        clearInterval(countdownTimerInterval);
        countdownTimerInterval = null;
    }
}

/**
 * Update waveform header with song information
 */
async function updateWaveformSongInfo(songMetadata, songUrl) {
    const songInfoEl = document.getElementById('waveform-header-song-info');
    const thumbnailEl = document.getElementById('waveform-header-song-thumbnail');
    const titleEl = document.getElementById('waveform-header-song-title');
    const artistEl = document.getElementById('waveform-header-song-artist');
    
    if (!songInfoEl || !thumbnailEl || !titleEl || !artistEl) return;
    
    // If we have metadata from backend, use it
    if (songMetadata && (songMetadata.title || songMetadata.artist)) {
        // Update thumbnail
        if (songMetadata.thumbnailUrl) {
            thumbnailEl.innerHTML = `<img src="${songMetadata.thumbnailUrl}" alt="Song thumbnail">`;
        } else {
            thumbnailEl.innerHTML = '<i class="fas fa-music"></i>';
        }
        
        // Update title and artist
        titleEl.textContent = songMetadata.title || 'Unknown Title';
        artistEl.textContent = songMetadata.artist || '';
    } else if (songUrl) {
        // If we have a URL but no metadata, try to resolve it
        try {
            const response = await fetch('/api/queue/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: songUrl })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    thumbnailEl.innerHTML = '<i class="fas fa-music"></i>';
                    titleEl.textContent = data.title || 'Unknown Title';
                    artistEl.textContent = data.artist || '';
                } else {
                    // Failed to resolve
                    thumbnailEl.innerHTML = '<i class="fas fa-music"></i>';
                    titleEl.textContent = 'Failed to load song info';
                    artistEl.textContent = '';
                }
            }
        } catch (error) {
            console.debug('Error resolving song info:', error);
            // Keep default state on error
        }
    } else {
        // No song selected
        thumbnailEl.innerHTML = '<i class="fas fa-music"></i>';
        titleEl.textContent = 'No song selected';
        artistEl.textContent = '';
    }
}


/**
 * Convert MM:SS format to seconds
 */
function parseTimestamp(timestampStr) {
    if (!timestampStr) return 0;
    const parts = timestampStr.split(':');
    if (parts.length === 2) {
        const minutes = parseInt(parts[0], 10) || 0;
        const seconds = parseInt(parts[1], 10) || 0;
        return minutes * 60 + seconds;
    }
    return parseInt(timestampStr, 10) || 0;
}

/**
 * Combine date and time inputs into ISO string
 */
function combineDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const date = new Date(`${dateStr}T${timeStr}`);
    return date.toISOString();
}

/**
 * Initialize countdown-specific event handlers
 */
function initCountdownSettingsHandlers() {
    // Handle enabled toggle changes
    const countdownEnabledEl = document.getElementById('setting-countdownEnabled');
    if (countdownEnabledEl) {
        countdownEnabledEl.addEventListener('change', async () => {
            // Immediately update status display after toggle changes
            setTimeout(() => updateCountdownStatus(), 100);
        });
    }
    
    // Handle split date/time changes
    const targetDateEl = document.getElementById('setting-countdownTargetDate');
    const targetTimeEl = document.getElementById('setting-countdownTargetTime');
    
    // Function to update label position based on input value
    const updateDateTimeLabel = (inputEl) => {
        if (!inputEl) return;
        const wrapper = inputEl.closest('.datetime-input-wrapper');
        if (!wrapper) return;
        
        if (inputEl.value) {
            wrapper.classList.add('has-value');
        } else {
            wrapper.classList.remove('has-value');
        }
    };
    
    const updateTargetDateTime = async () => {
        const dateStr = targetDateEl?.value || '';
        const timeStr = targetTimeEl?.value || '';
        if (dateStr && timeStr) {
            const isoDate = combineDateTime(dateStr, timeStr);
            await updateSettingsValue('countdown', 'targetDate', isoDate);
            // Immediately update status display
            updateCountdownStatus();
        } else {
            await updateSettingsValue('countdown', 'targetDate', null);
            // Immediately update status display
            updateCountdownStatus();
        }
    };
    
    if (targetDateEl) {
        // Update label on load
        updateDateTimeLabel(targetDateEl);
        
        // Open custom picker on click
        targetDateEl.addEventListener('click', (e) => {
            e.preventDefault();
            openDateTimePicker('date', targetDateEl, targetTimeEl);
        });
        
        targetDateEl.addEventListener('change', () => {
            updateDateTimeLabel(targetDateEl);
            updateTargetDateTime();
        });
    }
    if (targetTimeEl) {
        // Update label on load
        updateDateTimeLabel(targetTimeEl);
        
        // Open custom picker on click
        targetTimeEl.addEventListener('click', (e) => {
            e.preventDefault();
            openDateTimePicker('time', targetDateEl, targetTimeEl);
        });
        
        targetTimeEl.addEventListener('change', () => {
            updateDateTimeLabel(targetTimeEl);
            updateTargetDateTime();
        });
    }
    
    // Initialize datetime picker
    initDateTimePicker();
    
    // Initialize message configuration modal
    initMessageConfigurationModal();

    // Handle show threshold dropdown
    const showThresholdEl = document.getElementById('setting-countdownShowThreshold');
    const showThresholdCustomEl = document.getElementById('setting-countdownShowThresholdCustom');
    
    if (showThresholdEl) {
        showThresholdEl.addEventListener('change', async (e) => {
            if (e.target.value === 'custom') {
                if (showThresholdCustomEl) {
                    showThresholdCustomEl.style.display = 'inline-block';
                    showThresholdCustomEl.focus();
                }
            } else {
                if (showThresholdCustomEl) {
                    showThresholdCustomEl.style.display = 'none';
                }
                await updateSettingsValue('countdown', 'showThreshold', parseInt(e.target.value, 10));
            }
        });
    }
    
    if (showThresholdCustomEl) {
        showThresholdCustomEl.addEventListener('change', async (e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value) && value >= 10) {
                await updateSettingsValue('countdown', 'showThreshold', value);
            }
        });
    }

    // Handle song timestamp changes (auto-save)
    // The timestamp input is now hidden and updated by the waveform module
    const songTimestampEl = document.getElementById('setting-countdownSongTimestamp');
    if (songTimestampEl) {
        let saveTimeout;

        // Listen for changes from waveform module
        songTimestampEl.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(async () => {
                await saveCountdownSong(false); // Don't reload waveform
            }, 500); // Debounce 500ms
        });
    }

    // Handle browse button
    const browseBtn = document.getElementById('btn-browse-countdown-song');
    if (browseBtn) {
        browseBtn.addEventListener('click', () => {
            openCountdownSongModal();
        });
    }
}

/**
 * Save countdown song configuration
 * @param {boolean} triggerWaveform - Whether to trigger waveform loading after save
 */
async function saveCountdownSong(triggerWaveform = false) {
    const songUrl = document.getElementById('setting-countdownSongUrl')?.value?.trim() || null;
    const songTimestampStr = document.getElementById('setting-countdownSongTimestamp')?.value || '0:00';
    const songTimestamp = parseTimestamp(songTimestampStr);

    try {
        const res = await fetch('/api/countdown', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                song: {
                    url: songUrl,
                    timestamp: songTimestamp
                }
            })
        });

        const data = await res.json();
        if (data.success) {
            showSaveIndicator();

            // Update song info from response if available
            if (data.countdown && data.countdown.songMetadata) {
                updateWaveformSongInfo(data.countdown.songMetadata, songUrl);
            } else if (songUrl) {
                // If no metadata yet, try to resolve it
                updateWaveformSongInfo(null, songUrl);
            } else {
                // No song URL - clear song info
                updateWaveformSongInfo(null, null);
            }

            // If a song URL was provided, trigger background prefetch and waveform
            if (songUrl) {
                try {
                    await fetch('/api/countdown/prefetch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    // Prefetch initiated in background, no need to wait
                } catch (err) {
                    // Silently fail - prefetch is non-critical
                    console.debug('Prefetch initiation failed (non-critical):', err);
                }

                // Trigger waveform loading if requested
                if (triggerWaveform && window.countdownWaveform) {
                    window.countdownWaveform.triggerLoad();
                }
            } else {
                // No song URL - reset waveform
                if (window.countdownWaveform) {
                    window.countdownWaveform.reset();
                }
            }
        } else {
            console.error('Failed to save countdown song:', data.error);
        }
    } catch (err) {
        console.error('Failed to save countdown song:', err);
    }
}


/**
 * Open countdown song selection modal
 */
function openCountdownSongModal() {
    const modal = document.getElementById('countdown-song-modal');
    const songUrlInput = document.getElementById('countdown-song-url');
    const songUrlEl = document.getElementById('setting-countdownSongUrl');
    
    if (!modal || !songUrlInput) {
        // Fallback: prompt for URL
        const url = prompt('Enter YouTube/Spotify URL or search query:');
        if (url && songUrlEl) {
            songUrlEl.value = url;
            saveCountdownSong();
        }
        return;
    }
    
    // Pre-fill with current value if set
    songUrlInput.value = songUrlEl?.value || '';
    songUrlInput.dataset.originalValue = songUrlEl?.value || '';
    
    // Reset preview
    const preview = document.getElementById('countdown-song-preview');
    if (preview) {
        preview.classList.add('hidden');
    }
    
    // Open modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => songUrlInput.focus(), 100);
    
    // Setup form handler if not already set
    const form = document.getElementById('countdown-song-form');
    if (form && !form.dataset.handlerAttached) {
        form.addEventListener('submit', handleCountdownSongSubmit);
        form.dataset.handlerAttached = 'true';
        
        // Setup input handler for preview
        let previewTimeout;
        songUrlInput.addEventListener('input', () => {
            clearTimeout(previewTimeout);
            const value = songUrlInput.value.trim();
            
            if (value && value !== songUrlInput.dataset.originalValue) {
                previewTimeout = setTimeout(() => {
                    previewCountdownSong(value);
                }, 800); // Debounce 800ms
            } else {
                const preview = document.getElementById('countdown-song-preview');
                if (preview) {
                    preview.classList.add('hidden');
                }
            }
        });
    }
}

/**
 * Close countdown song selection modal
 */
function closeCountdownSongModal() {
    const modal = document.getElementById('countdown-song-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * Preview countdown song (resolve without saving)
 */
async function previewCountdownSong(input) {
    const preview = document.getElementById('countdown-song-preview');
    const previewTitle = preview?.querySelector('.countdown-song-preview-title');
    const previewArtist = preview?.querySelector('.countdown-song-preview-artist');
    
    if (!preview || !previewTitle || !previewArtist) return;
    
    preview.classList.remove('hidden');
    previewTitle.textContent = 'Resolving...';
    previewArtist.textContent = '';
    
    try {
        const response = await fetch('/api/queue/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: input })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                previewTitle.textContent = data.title || 'Unknown Track';
                previewArtist.textContent = data.artist || '';
            } else {
                previewTitle.textContent = 'Failed to resolve';
                previewArtist.textContent = data.error || '';
            }
        } else {
            const error = await response.json();
            previewTitle.textContent = 'Failed to resolve';
            previewArtist.textContent = error.error || error.details || 'Unknown error';
        }
    } catch (error) {
        previewTitle.textContent = 'Connection error';
        previewArtist.textContent = 'Please check your connection';
        console.error('Error previewing countdown song:', error);
    }
}

/**
 * Handle countdown song form submission
 */
async function handleCountdownSongSubmit(e) {
    e.preventDefault();
    
    const songUrlInput = document.getElementById('countdown-song-url');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const songUrlEl = document.getElementById('setting-countdownSongUrl');
    
    if (!songUrlInput || !songUrlEl) return;
    
    const input = songUrlInput.value.trim();
    if (!input) return;
    
    const originalBtnContent = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-compact-disc fa-spin"></i> Resolving...';
    submitBtn.disabled = true;
    
    try {
        // Resolve the song
        const response = await fetch('/api/queue/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: input })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // Set the resolved URL in the countdown song input
                songUrlEl.value = data.url;
                
                // Save the countdown song configuration
                await saveCountdownSong(true); // Trigger waveform loading
                
                // Close modal
                closeCountdownSongModal();
                
                // Show success notification
                const successText = `Countdown song set: ${data.title || 'Track'}`;
                if (window.showNotification) {
                    showNotification(successText, 'success');
                }
            } else {
                const errorText = data.error || 'Failed to resolve song';
                if (window.showNotification) {
                    showNotification(errorText, 'error');
                }
            }
        } else {
            const error = await response.json();
            const errorText = error.error || error.details || 'Failed to resolve song';
            if (window.showNotification) {
                showNotification(errorText, 'error');
            }
        }
    } catch (error) {
        console.error('Error resolving countdown song:', error);
        if (window.showNotification) {
            showNotification('Connection error. Please try again.', 'error');
        }
    } finally {
        submitBtn.innerHTML = originalBtnContent;
        submitBtn.disabled = false;
    }
}

/**
 * Format milliseconds as HH:MM:SS
 */
function formatTimeRemaining(ms) {
    if (ms <= 0) return '00:00:00';
    
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return [hours, minutes, seconds]
        .map(n => n.toString().padStart(2, '0'))
        .join(':');
}

/**
 * Update countdown status display
 */
async function updateCountdownStatus() {
    const statusText = document.getElementById('countdown-status-text');
    const timeRemaining = document.getElementById('countdown-time-remaining');
    
    if (!statusText || !timeRemaining) return;
    
    // First, try to calculate from UI inputs (immediate feedback)
    const countdownEnabledEl = document.getElementById('setting-countdownEnabled');
    const targetDateEl = document.getElementById('setting-countdownTargetDate');
    const targetTimeEl = document.getElementById('setting-countdownTargetTime');
    
    const isEnabled = countdownEnabledEl?.checked || false;
    const dateStr = targetDateEl?.value || '';
    const timeStr = targetTimeEl?.value || '';
    
    // If we have date/time in UI, calculate immediately
    if (isEnabled && dateStr && timeStr) {
        const targetDateTime = combineDateTime(dateStr, timeStr);
        if (targetDateTime) {
            const targetTime = new Date(targetDateTime).getTime();
            const now = Date.now();
            const remaining = Math.max(0, targetTime - now);
            
            if (remaining > 0) {
                statusText.textContent = 'Countdown is active';
                timeRemaining.textContent = formatTimeRemaining(remaining);
                timeRemaining.classList.add('active');
            } else {
                statusText.textContent = 'Countdown has completed';
                timeRemaining.textContent = '00:00:00';
                timeRemaining.classList.remove('active');
            }
        }
    } else if (!isEnabled) {
        statusText.textContent = 'Countdown is disabled';
        timeRemaining.textContent = '--:--:--';
        timeRemaining.classList.remove('active');
    } else if (!dateStr || !timeStr) {
        statusText.textContent = 'No target date configured';
        timeRemaining.textContent = '--:--:--';
        timeRemaining.classList.remove('active');
    }
    
    // Fetch from API once for initial status (SSE will handle updates)
    try {
        const res = await fetch('/api/countdown');
        if (!res.ok) return;

        const data = await res.json();
        if (!data.success || !data.countdown) return;

        updateCountdownStatusFromData(data.countdown);
    } catch (err) {
        // Silently fail - don't spam console, UI calculation above will handle display
    }
}

/**
 * Custom Date/Time Picker
 */
let datetimePickerState = {
    currentDate: new Date(),
    selectedDate: null,
    selectedTime: { hours: 12, minutes: 0 },
    targetInput: null,
    timeInput: null
};

function initDateTimePicker() {
    const modal = document.getElementById('datetime-picker-modal');
    if (!modal) return;
    
    // Close handlers
    const closeBtn = document.getElementById('datetime-picker-close');
    const cancelBtn = document.getElementById('datetime-picker-cancel');
    const confirmBtn = document.getElementById('datetime-picker-confirm');
    
    if (closeBtn) closeBtn.addEventListener('click', closeDateTimePicker);
    if (cancelBtn) cancelBtn.addEventListener('click', closeDateTimePicker);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmDateTimeSelection);
    
    // Tab switching
    const tabs = modal.querySelectorAll('.datetime-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchDateTimeTab(tabName);
        });
    });
    
    // Month navigation
    const prevBtn = document.getElementById('prev-month');
    const nextBtn = document.getElementById('next-month');
    if (prevBtn) prevBtn.addEventListener('click', () => navigateMonth(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateMonth(1));
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeDateTimePicker();
    });
}

function openDateTimePicker(initialTab, dateInput, timeInput) {
    const modal = document.getElementById('datetime-picker-modal');
    if (!modal) return;
    
    datetimePickerState.targetInput = dateInput;
    datetimePickerState.timeInput = timeInput;
    
    // Get current values
    const currentDate = dateInput?.value ? new Date(dateInput.value) : new Date();
    const currentTime = timeInput?.value ? timeInput.value.split(':') : ['12', '00'];
    
    datetimePickerState.currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    datetimePickerState.selectedDate = dateInput?.value ? new Date(dateInput.value) : null;
    datetimePickerState.selectedTime = {
        hours: parseInt(currentTime[0]) || 12,
        minutes: parseInt(currentTime[1]) || 0
    };
    
    // Render calendar and time picker
    renderCalendar();
    renderTimePicker();
    updateSelectedDateTimeDisplay();
    
    // Switch to appropriate tab
    switchDateTimeTab(initialTab);
    
    // Show modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeDateTimePicker() {
    const modal = document.getElementById('datetime-picker-modal');
    if (!modal) return;
    
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function switchDateTimeTab(tabName) {
    const tabs = document.querySelectorAll('.datetime-tab');
    const contents = document.querySelectorAll('.datetime-picker-content');
    
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    contents.forEach(content => {
        if (content.dataset.content === tabName) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // Update icon and title
    const icon = document.getElementById('datetime-picker-icon');
    const title = document.getElementById('datetime-picker-title');
    if (icon && title) {
        if (tabName === 'date') {
            icon.className = 'fas fa-calendar-alt';
            title.textContent = 'Select Date';
        } else {
            icon.className = 'fas fa-clock';
            title.textContent = 'Select Time';
        }
    }
}

function navigateMonth(direction) {
    datetimePickerState.currentDate.setMonth(datetimePickerState.currentDate.getMonth() + direction);
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthYear = document.getElementById('current-month-year');
    if (!grid || !monthYear) return;
    
    const year = datetimePickerState.currentDate.getFullYear();
    const month = datetimePickerState.currentDate.getMonth();
    
    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    monthYear.textContent = `${monthNames[month]} ${year}`;
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Clear grid
    grid.innerHTML = '';
    
    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayEl = createCalendarDay(day, true);
        grid.appendChild(dayEl);
    }
    
    // Current month days
    const today = new Date();
    const selectedDate = datetimePickerState.selectedDate;
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const isToday = date.toDateString() === today.toDateString();
        const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
        
        const dayEl = createCalendarDay(day, false, isToday, isSelected);
        dayEl.addEventListener('click', () => selectDate(date));
        grid.appendChild(dayEl);
    }
    
    // Fill remaining cells
    const totalCells = grid.children.length;
    const remaining = 42 - totalCells; // 6 rows * 7 days
    for (let day = 1; day <= remaining; day++) {
        const dayEl = createCalendarDay(day, true);
        grid.appendChild(dayEl);
    }
}

function createCalendarDay(day, isOtherMonth, isToday = false, isSelected = false) {
    const dayEl = document.createElement('div');
    dayEl.className = 'datetime-calendar-day';
    dayEl.textContent = day;
    
    if (isOtherMonth) dayEl.classList.add('other-month');
    if (isToday) dayEl.classList.add('today');
    if (isSelected) dayEl.classList.add('selected');
    
    return dayEl;
}

function selectDate(date) {
    datetimePickerState.selectedDate = date;
    renderCalendar();
    updateSelectedDateTimeDisplay();
}

function renderTimePicker() {
    const hoursContainer = document.getElementById('hours-items');
    const minutesContainer = document.getElementById('minutes-items');
    if (!hoursContainer || !minutesContainer) return;
    
    // Render hours (0-23)
    hoursContainer.innerHTML = '';
    for (let h = 0; h < 24; h++) {
        const item = document.createElement('div');
        item.className = 'time-picker-item';
        item.textContent = h.toString().padStart(2, '0');
        if (h === datetimePickerState.selectedTime.hours) {
            item.classList.add('selected');
        }
        item.addEventListener('click', () => selectTime(h, null));
        hoursContainer.appendChild(item);
    }
    
    // Render minutes (0-59, every 5 minutes)
    minutesContainer.innerHTML = '';
    for (let m = 0; m < 60; m += 5) {
        const item = document.createElement('div');
        item.className = 'time-picker-item';
        item.textContent = m.toString().padStart(2, '0');
        if (m === datetimePickerState.selectedTime.minutes) {
            item.classList.add('selected');
        }
        item.addEventListener('click', () => selectTime(null, m));
        minutesContainer.appendChild(item);
    }
    
    // Scroll to selected items
    setTimeout(() => {
        scrollToSelectedTime();
    }, 100);
}

function selectTime(hours, minutes) {
    if (hours !== null) datetimePickerState.selectedTime.hours = hours;
    if (minutes !== null) datetimePickerState.selectedTime.minutes = minutes;
    
    renderTimePicker();
    updateSelectedDateTimeDisplay();
}

function scrollToSelectedTime() {
    const hoursScroll = document.getElementById('hours-scroll');
    const minutesScroll = document.getElementById('minutes-scroll');
    const hoursItems = document.getElementById('hours-items');
    const minutesItems = document.getElementById('minutes-items');
    
    if (hoursScroll && hoursItems) {
        const selectedHour = hoursItems.querySelector('.selected');
        if (selectedHour) {
            hoursScroll.scrollTop = selectedHour.offsetTop - 80;
        }
    }
    
    if (minutesScroll && minutesItems) {
        const selectedMinute = minutesItems.querySelector('.selected');
        if (selectedMinute) {
            minutesScroll.scrollTop = selectedMinute.offsetTop - 80;
        }
    }
}

function updateSelectedDateTimeDisplay() {
    const display = document.getElementById('selected-datetime-text');
    if (!display) return;
    
    let text = 'Not selected';
    
    if (datetimePickerState.selectedDate) {
        const dateStr = datetimePickerState.selectedDate.toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        const timeStr = `${datetimePickerState.selectedTime.hours.toString().padStart(2, '0')}:${datetimePickerState.selectedTime.minutes.toString().padStart(2, '0')}`;
        text = `${dateStr} at ${timeStr}`;
    }
    
    display.textContent = text;
}

function confirmDateTimeSelection() {
    if (!datetimePickerState.selectedDate) {
        // If no date selected, use today
        datetimePickerState.selectedDate = new Date();
    }
    
    // Format date as YYYY-MM-DD
    const year = datetimePickerState.selectedDate.getFullYear();
    const month = (datetimePickerState.selectedDate.getMonth() + 1).toString().padStart(2, '0');
    const day = datetimePickerState.selectedDate.getDate().toString().padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Format time as HH:MM
    const timeStr = `${datetimePickerState.selectedTime.hours.toString().padStart(2, '0')}:${datetimePickerState.selectedTime.minutes.toString().padStart(2, '0')}`;
    
    // Update inputs
    if (datetimePickerState.targetInput) {
        datetimePickerState.targetInput.value = dateStr;
        const wrapper = datetimePickerState.targetInput.closest('.datetime-input-wrapper');
        if (wrapper) wrapper.classList.add('has-value');
    }
    
    if (datetimePickerState.timeInput) {
        datetimePickerState.timeInput.value = timeStr;
        const wrapper = datetimePickerState.timeInput.closest('.datetime-input-wrapper');
        if (wrapper) wrapper.classList.add('has-value');
    }
    
    // Trigger change events
    if (datetimePickerState.targetInput) {
        datetimePickerState.targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (datetimePickerState.timeInput) {
        datetimePickerState.timeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    closeDateTimePicker();
}

/**
 * Countdown Message Configuration Modal
 */
function initMessageConfigurationModal() {
    const openBtn = document.getElementById('btn-configure-message');
    const modal = document.getElementById('countdown-message-modal');
    const closeBtn = document.getElementById('countdown-message-modal-close');
    const cancelBtn = document.getElementById('countdown-message-cancel');
    const saveBtn = document.getElementById('countdown-message-save');
    const messageText = document.getElementById('countdown-message-text');
    const charCount = document.getElementById('message-char-count');
    const durationInput = document.getElementById('countdown-message-duration');
    const durationCustom = document.getElementById('countdown-message-duration-custom');
    const presetBtns = document.querySelectorAll('.duration-preset-btn');
    
    if (!openBtn || !modal) return;
    
    // Open modal
    openBtn.addEventListener('click', () => {
        const messageEl = document.getElementById('setting-countdownMessage');
        const durationEl = document.getElementById('setting-countdownMessageDuration');
        
        if (messageText) {
            messageText.value = messageEl?.value || 'Happy New Year! 🎉';
            updateCharCount();
        }
        
        if (durationInput && durationEl) {
            const duration = parseInt(durationEl.value) || 30;
            durationInput.value = duration;
            
            // Set active preset or show custom
            let foundPreset = false;
            presetBtns.forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.duration === duration.toString()) {
                    btn.classList.add('active');
                    foundPreset = true;
                } else if (btn.dataset.duration === 'custom' && !foundPreset && ![10, 15, 30, 60].includes(duration)) {
                    btn.classList.add('active');
                    const customContainer = document.getElementById('duration-custom-container');
                    if (customContainer) {
                        customContainer.style.display = 'flex';
                    }
                    if (durationCustom) {
                        durationCustom.value = duration;
                    }
                }
            });
        }
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    // Close modal
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Character count
    if (messageText && charCount) {
        messageText.addEventListener('input', updateCharCount);
    }
    
    function updateCharCount() {
        if (charCount && messageText) {
            charCount.textContent = messageText.value.length;
        }
    }
    
    // Duration presets
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const customContainer = document.getElementById('duration-custom-container');
            if (btn.dataset.duration === 'custom') {
                if (customContainer) {
                    customContainer.style.display = 'flex';
                }
                if (durationCustom) {
                    durationCustom.focus();
                }
            } else {
                if (customContainer) {
                    customContainer.style.display = 'none';
                }
                if (durationInput) {
                    durationInput.value = btn.dataset.duration;
                }
            }
        });
    });
    
    // Custom duration input
    if (durationCustom) {
        durationCustom.addEventListener('input', (e) => {
            const value = parseInt(e.target.value) || 0;
            if (value >= 5 && value <= 300) {
                if (durationInput) {
                    durationInput.value = value;
                }
            }
        });
    }
    
    // Save
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const message = messageText?.value.trim() || 'Happy New Year! 🎉';
            const duration = parseInt(durationInput?.value) || 30;
            
            // Update hidden inputs
            const messageEl = document.getElementById('setting-countdownMessage');
            const durationEl = document.getElementById('setting-countdownMessageDuration');
            
            if (messageEl) {
                messageEl.value = message;
            }
            if (durationEl) {
                durationEl.value = duration;
            }
            
            // Save to backend
            await updateSettingsValue('countdown', 'message', message);
            await updateSettingsValue('countdown', 'messageDisplayDuration', duration);
            
            // Update preview
            updateMessagePreview();
            
            // Close modal
            closeModal();
            
            // Show save indicator
            showSaveIndicator();
        });
    }
}

function updateMessagePreview() {
    const preview = document.getElementById('countdown-message-preview');
    const messageEl = document.getElementById('setting-countdownMessage');
    
    if (preview && messageEl) {
        const message = messageEl.value || 'Happy New Year! 🎉';
        preview.textContent = message.length > 40 ? message.substring(0, 40) + '...' : message;
    }
}

