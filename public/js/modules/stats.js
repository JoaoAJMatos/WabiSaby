/**
 * Statistics Module
 * Handles statistics fetching and display functions
 */

// Initialize tabs logic
function initStatsTabs() {
    const tabs = document.querySelectorAll('.stats-tab-btn');
    if (!tabs.length) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.stats-tab-content').forEach(c => c.classList.remove('active'));

            // Activate clicked tab
            tab.classList.add('active');
            const targetId = `tab-${tab.dataset.tab}`;
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // Fetch data for the new tab
            if (tab.dataset.tab === 'requesters') {
                fetchRequestersView();
            } else if (tab.dataset.tab === 'history') {
                fetchHistoryView();
            } else {
                fetchOverviewView();
            }
        });
    });
}

// Fetch and display overview from backend
async function fetchOverviewView() {
    const container = document.querySelector('.stats-overview');
    if (!container) {
        console.warn('Stats overview container not found');
        return;
    }

    try {
        const res = await fetch('/api/stats/overview');
        if (!res.ok) throw new Error('Failed to fetch');

        const data = await res.json();

        // Helper functions for formatting
        function formatDuration(ms) {
            const hours = Math.floor(ms / 3600000);
            const minutes = Math.floor((ms % 3600000) / 60000);
            if (hours > 0) {
                return `${hours}h ${minutes}m`;
            }
            return `${minutes}m`;
        }

        function formatHour(hour) {
            if (hour === null || hour === undefined) return '-';
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
            return `${displayHour}${period}`;
        }

        // Build hourly chart
        let hourlyChart = '';
        // Convert object { "0": 1, "15": 3 } to array [{hour: 0, count: 1}, ...]
        let hourlyData = [];
        if (data.hourlyDistribution) {
            hourlyData = Object.entries(data.hourlyDistribution).map(([hour, count]) => ({
                hour: parseInt(hour),
                count
            }));
        }

        if (hourlyData.length > 0) {
            const maxCount = Math.max(...hourlyData.map(h => h.count));

            // Fill in missing hours for smoother chart (optional but looks better)
            // But for now, let's just show what we have or map 0-23
            const fullHourlyData = Array.from({ length: 24 }, (_, i) => {
                const existing = hourlyData.find(h => h.hour === i);
                return existing || { hour: i, count: 0 };
            });

            hourlyChart = `
                <div class="overview-section">
                    <h4><i class="fas fa-chart-line"></i> Activity by Hour</h4>
                    <div class="hourly-chart">
                        <div class="hour-bars">
                            ${fullHourlyData.map(({ hour, count }) => {
                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                // Only show height if > 0 to preserve min-height
                return `<div class="hour-bar" style="height: ${Math.max(5, height)}%" title="${formatHour(hour)}: ${count} songs"></div>`;
            }).join('')}
                        </div>
                        <div class="hour-labels">
                            <span>12AM</span><span>6AM</span><span>12PM</span><span>6PM</span><span>11PM</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Build top artists section
        let artistsSection = '';
        if (data.topArtists && data.topArtists.length > 0) {
            artistsSection = `
                <div class="overview-section">
                    <h4><i class="fas fa-microphone-alt"></i> Top Artists</h4>
                    <div class="overview-list">
                        ${data.topArtists.map(({ name, count }, i) => `
                            <div class="overview-list-item">
                                <span class="overview-rank">${i + 1}</span>
                                <span class="overview-name">${name}</span>
                                <span class="overview-count">${count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        const totalSongsLabel = window.i18n?.tSync('ui.dashboard.analytics.totalSongs') || 'Total Songs';
        const totalPlaytimeLabel = window.i18n?.tSync('ui.dashboard.analytics.totalPlaytime') || 'Total Playtime';
        const uniqueDJsLabel = window.i18n?.tSync('ui.dashboard.analytics.uniqueDJs') || 'Unique DJs';
        const artistsPlayedLabel = window.i18n?.tSync('ui.dashboard.analytics.artistsPlayed') || 'Artists Played';
        const avgSongLabel = window.i18n?.tSync('ui.dashboard.analytics.avgSong') || 'Avg Song';
        const peakHourLabel = window.i18n?.tSync('ui.dashboard.analytics.peakHour') || 'Peak Hour';
        
        container.innerHTML = `
            <div class="overview-grid">
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-play-circle"></i></div>
                    <div class="overview-stat-value">${data.songsPlayed || 0}</div>
                    <div class="overview-stat-label">${totalSongsLabel}</div>
                </div>
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-hourglass-half"></i></div>
                    <div class="overview-stat-value">${data.totalDuration > 0 ? formatDuration(data.totalDuration) : '-'}</div>
                    <div class="overview-stat-label">${totalPlaytimeLabel}</div>
                </div>
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-users"></i></div>
                    <div class="overview-stat-value">${data.uniqueRequesters || 0}</div>
                    <div class="overview-stat-label">${uniqueDJsLabel}</div>
                </div>
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-star"></i></div>
                    <div class="overview-stat-value">${data.uniqueArtists || 0}</div>
                    <div class="overview-stat-label">${artistsPlayedLabel}</div>
                </div>
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-clock"></i></div>
                    <div class="overview-stat-value">${data.avgDuration > 0 ? formatDuration(data.avgDuration) : '-'}</div>
                    <div class="overview-stat-label">${avgSongLabel}</div>
                </div>
                <div class="overview-stat">
                    <div class="overview-stat-icon"><i class="fas fa-fire"></i></div>
                    <div class="overview-stat-value">${formatHour(data.peakHour)}</div>
                    <div class="overview-stat-label">${peakHourLabel}</div>
                </div>
            </div>
            ${hourlyChart}
            ${artistsSection}
        `;
    } catch (e) {
        console.error(e);
        const failedText = window.i18n?.tSync('ui.dashboard.analytics.failedToLoad') || 'Failed to load overview';
        container.innerHTML = `<p class="stats-placeholder">${failedText}</p>`;
    }
}

// Fetch and display top requesters from backend
async function fetchRequestersView() {
    const container = document.querySelector('.requesters-list');
    if (!container) {
        console.warn('Requesters list container not found');
        return;
    }

    try {
        const res = await fetch('/api/stats/requesters?limit=20');
        if (!res.ok) throw new Error('Failed to fetch');

        const requesters = await res.json();

        if (requesters.length === 0) {
            container.innerHTML = '<p class="stats-placeholder">No requests yet</p>';
            return;
        }

        container.innerHTML = requesters.map(({ rank, name, count }) => {
            const rankClass = rank <= 3 ? `top-${rank}` : '';
            const rankIcon = rank === 1 ? '👑' : rank;

            return `
                <div class="requester-item">
                    <div class="requester-info">
                        <div class="requester-rank ${rankClass}">${rankIcon}</div>
                        <div class="requester-details">
                            <div class="requester-name">${name}</div>
                            <div class="requester-subtitle">Rank #${rank}</div>
                        </div>
                    </div>
                    <div class="requester-count">
                        <i class="fas fa-music"></i>
                        ${count} ${count === 1 ? 'song' : 'songs'}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = '<p class="stats-placeholder">Failed to load requesters</p>';
    }
}

// Fetch and display history from backend
async function fetchHistoryView() {
    const container = document.querySelector('.history-list');
    if (!container) {
        console.warn('History list container not found');
        return;
    }

    try {
        const res = await fetch('/api/stats/history?limit=20');
        if (!res.ok) throw new Error('Failed to fetch');

        const history = await res.json();

        if (history.length === 0) {
            container.innerHTML = '<p class="stats-placeholder">No songs played yet</p>';
            return;
        }

        container.innerHTML = history.map(song => {
            const timeAgo = getTimeAgo(song.playedAt);
            return `
                <div class="history-item">
                    ${song.thumbnailUrl ? `
                        <div class="history-thumbnail">
                            <img src="${song.thumbnailUrl}" alt="Thumbnail">
                        </div>
                    ` : ''}
                    <div class="history-details">
                        <div class="history-title">${song.title}</div>
                        <div class="history-meta">
                            <span><i class="fas fa-user"></i> ${song.requester}</span>
                        </div>
                    </div>
                    <div class="history-time">${timeAgo}</div>
                </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = '<p class="stats-placeholder">Failed to load history</p>';
    }
}

// Fetch detailed stats periodically
async function fetchDetailedStats() {
    try {
        const res = await fetch('/api/stats');
        if (!res.ok) return;

        const stats = await res.json();

        // Update songs played counter from backend stats
        const songsPlayedEl = document.getElementById('songs-played-value');
        if (songsPlayedEl) {
            songsPlayedEl.textContent = stats.songsPlayed || 0;
        }

        // Update uptime from backend stats
        const uptimeEl = document.getElementById('uptime-value');
        if (uptimeEl && stats.uptime) {
            uptimeEl.textContent = formatUptime(stats.uptime);
        }

        // Refresh active tab data if visible
        const activeTab = document.querySelector('.stats-tab-btn.active');
        if (activeTab) {
            const tab = activeTab.dataset.tab;
            if (tab === 'requesters') {
                fetchRequestersView();
            } else if (tab === 'history') {
                fetchHistoryView();
            }
        }
    } catch (e) {
        // Silent fail
    }
}

// Analytics Collapse Toggle
function toggleStatsCollapse() {
    const statsSection = document.getElementById('stats');
    const collapseBtn = document.getElementById('stats-collapse-btn');

    if (statsSection.classList.contains('collapsed')) {
        statsSection.classList.remove('collapsed');
        collapseBtn.setAttribute('title', 'Collapse Analytics');
    } else {
        statsSection.classList.add('collapsed');
        collapseBtn.setAttribute('title', 'Expand Analytics');
    }
}

// Load overview on initial page load
fetchOverviewView();

// Fetch detailed stats every 30 seconds (less frequent, backend handles persistence)
setInterval(fetchDetailedStats, 30000);
// Initial fetch
initStatsTabs();
fetchDetailedStats();

// Listen for language changes to refresh stats labels
window.addEventListener('languageChanged', async (event) => {
    // Refresh the active tab to update labels
    const activeTab = document.querySelector('.stats-tab-btn.active');
    if (activeTab) {
        const tab = activeTab.dataset.tab;
        if (tab === 'requesters') {
            fetchRequestersView();
        } else if (tab === 'history') {
            fetchHistoryView();
        } else {
            fetchOverviewView();
        }
    }
});


