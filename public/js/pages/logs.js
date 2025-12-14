        // State
        let logs = [];
        let filteredLogs = [];
        let currentFilter = 'all';
        let searchTerm = '';
        let autoScroll = true;
        let newLogsCount = 0;
        let eventSource = null;
        let scrollTimeout = null;
        let isInitialLoad = true;

        // DOM Elements
        const logsList = document.getElementById('logs-list');
        const logsScroll = document.getElementById('logs-scroll');
        const emptyState = document.getElementById('empty-state');
        const searchInput = document.getElementById('search-input');
        const filterBtns = document.querySelectorAll('.filter-btn');
        const clearBtn = document.getElementById('clear-btn');
        const autoScrollBtn = document.getElementById('auto-scroll-btn');
        const newLogsBtn = document.getElementById('new-logs-btn');
        const connectionDot = document.getElementById('connection-dot');
        const connectionStatus = document.getElementById('connection-status');

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            connectSSE();
            setupEventListeners();
            initConfirmationModalListeners();
            fetchStats();
            
            // Periodic stats refresh
            setInterval(fetchStats, 5000);
        });

        // Connect to SSE stream
        function connectSSE() {
            if (eventSource) {
                eventSource.close();
            }

            isInitialLoad = true;
            eventSource = new EventSource('/api/logs/stream');

            eventSource.onopen = () => {
                connectionDot.classList.remove('disconnected');
                connectionStatus.textContent = 'Connected';
            };

            eventSource.onerror = () => {
                connectionDot.classList.add('disconnected');
                connectionStatus.textContent = 'Reconnecting...';
                
                // Try to reconnect after 3 seconds
                setTimeout(() => {
                    if (eventSource.readyState === EventSource.CLOSED) {
                        connectSSE();
                    }
                }, 3000);
            };

            eventSource.onmessage = (event) => {
                try {
                    const log = JSON.parse(event.data);
                    addLog(log);
                } catch (e) {
                    console.error('Failed to parse log:', e);
                }
            };

            eventSource.addEventListener('clear', () => {
                logs = [];
                filteredLogs = [];
                renderLogs();
                updateCounts();
            });

            eventSource.addEventListener('connected', () => {
                connectionDot.classList.remove('disconnected');
                connectionStatus.textContent = 'Connected';
                
                // Mark initial load complete after a short delay (to allow initial batch to arrive)
                setTimeout(() => {
                    isInitialLoad = false;
                    // Ensure we're scrolled to bottom after initial load
                    if (autoScroll) {
                        scrollToBottom();
                    }
                }, 500);
            });
        }

        // Add a new log entry
        function addLog(log) {
            logs.push(log);
            
            // Keep only last 500 logs in UI for performance
            if (logs.length > 500) {
                logs = logs.slice(-500);
            }

            // Check if it matches current filter
            if (matchesFilter(log)) {
                filteredLogs.push(log);
                appendLogEntry(log);
                
                if (autoScroll) {
                    scrollToBottom();
                } else {
                    newLogsCount++;
                    updateNewLogsButton();
                }
            }

            updateCounts();
            emptyState.style.display = logs.length === 0 ? 'flex' : 'none';
        }

        // Check if log matches current filter
        function matchesFilter(log) {
            // Level filter
            if (currentFilter !== 'all' && log.level !== currentFilter) {
                return false;
            }

            // Search filter
            if (searchTerm) {
                const search = searchTerm.toLowerCase();
                return log.message.toLowerCase().includes(search) ||
                       log.source.toLowerCase().includes(search);
            }

            return true;
        }

        // Render all logs
        function renderLogs() {
            filteredLogs = logs.filter(log => matchesFilter(log));
            logsList.innerHTML = '';
            
            filteredLogs.forEach(log => {
                appendLogEntry(log, false);
            });

            emptyState.style.display = filteredLogs.length === 0 ? 'flex' : 'none';
            
            if (autoScroll) {
                scrollToBottom();
            }
        }

        // Append a single log entry
        function appendLogEntry(log, animate = true) {
            const entry = document.createElement('div');
            entry.className = `log-entry ${log.level}`;
            if (!animate) {
                entry.style.animation = 'none';
            }

            const time = new Date(log.timestamp);
            const timeStr = time.toLocaleTimeString('en-US', { hour12: false });

            let message = escapeHtml(log.message);
            if (searchTerm) {
                message = highlightSearch(message, searchTerm);
            }

            const levelIcons = {
                info: 'fa-info-circle',
                warn: 'fa-exclamation-triangle',
                error: 'fa-times-circle',
                debug: 'fa-bug'
            };

            entry.innerHTML = `
                <span class="log-timestamp">${timeStr}</span>
                <span class="log-level">
                    <i class="fas ${levelIcons[log.level] || 'fa-circle'}"></i>
                    ${log.level}
                </span>
                <span class="log-message">${message}</span>
                <span class="log-source">${escapeHtml(log.source)}</span>
            `;

            logsList.appendChild(entry);
        }

        // Escape HTML
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Highlight search term
        function highlightSearch(text, term) {
            const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
            return text.replace(regex, '<span class="highlight">$1</span>');
        }

        // Escape regex special characters
        function escapeRegex(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        // Scroll to bottom (debounced during initial load, immediate after)
        function scrollToBottom(force = false) {
            const doScroll = () => {
                // Use multiple methods to ensure scrolling works
                logsScroll.scrollTop = logsScroll.scrollHeight;
                
                // Also try scrolling the last log entry into view as a fallback
                const lastEntry = logsList.lastElementChild;
                if (lastEntry) {
                    lastEntry.scrollIntoView({ behavior: 'auto', block: 'end' });
                }
            };
            
            if (isInitialLoad && !force) {
                // Debounce during initial batch load
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    requestAnimationFrame(doScroll);
                }, 50);
            } else {
                // Immediate scroll for new logs or forced scrolls
                requestAnimationFrame(doScroll);
            }
        }

        // Update counts
        function updateCounts() {
            document.getElementById('count-all').textContent = logs.length;
            document.getElementById('count-info').textContent = logs.filter(l => l.level === 'info').length;
            document.getElementById('count-warn').textContent = logs.filter(l => l.level === 'warn').length;
            document.getElementById('count-error').textContent = logs.filter(l => l.level === 'error').length;
            document.getElementById('count-debug').textContent = logs.filter(l => l.level === 'debug').length;
            document.getElementById('total-logs').textContent = logs.length;
        }

        // Update new logs button
        function updateNewLogsButton() {
            if (newLogsCount > 0 && !autoScroll) {
                newLogsBtn.classList.add('visible');
                newLogsBtn.querySelector('span').textContent = `${newLogsCount} new log${newLogsCount > 1 ? 's' : ''}`;
            } else {
                newLogsBtn.classList.remove('visible');
            }
        }

        // Fetch stats
        async function fetchStats() {
            try {
                const response = await fetch('/api/logs/stats');
                const stats = await response.json();
                document.getElementById('connected-clients').textContent = stats.connectedClients;
            } catch (e) {
                // Ignore errors
            }
        }

        // Setup event listeners
        function setupEventListeners() {
            // Filter buttons
            filterBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    filterBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentFilter = btn.dataset.level;
                    renderLogs();
                });
            });

            // Search input
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    searchTerm = searchInput.value;
                    renderLogs();
                }, 150);
            });

            // Clear button
            clearBtn.addEventListener('click', () => {
                showConfirmationModal({
                    title: 'Clear All Logs',
                    message: 'Are you sure you want to clear all logs? This action cannot be undone.',
                    icon: 'fa-trash-alt',
                    onConfirm: async () => {
                        try {
                            await fetch('/api/logs/clear', { method: 'POST' });
                            logs = [];
                            filteredLogs = [];
                            renderLogs();
                            updateCounts();
                        } catch (e) {
                            console.error('Failed to clear logs:', e);
                        }
                    }
                });
            });

            // Auto-scroll toggle
            autoScrollBtn.addEventListener('click', () => {
                autoScroll = !autoScroll;
                autoScrollBtn.classList.toggle('active', autoScroll);
                
                if (autoScroll) {
                    // Force immediate scroll when enabling auto-scroll
                    scrollToBottom(true);
                    // Double-check after a brief delay to ensure it worked
                    setTimeout(() => {
                        scrollToBottom(true);
                    }, 100);
                    newLogsCount = 0;
                    updateNewLogsButton();
                }
            });

            // New logs button
            newLogsBtn.addEventListener('click', () => {
                autoScroll = true;
                autoScrollBtn.classList.add('active');
                scrollToBottom(true);
                // Double-check after a brief delay
                setTimeout(() => {
                    scrollToBottom(true);
                }, 100);
                newLogsCount = 0;
                updateNewLogsButton();
            });

            // Detect manual scroll
            logsScroll.addEventListener('scroll', () => {
                const isAtBottom = logsScroll.scrollHeight - logsScroll.scrollTop - logsScroll.clientHeight < 50;
                
                if (!isAtBottom && autoScroll) {
                    autoScroll = false;
                    autoScrollBtn.classList.remove('active');
                } else if (isAtBottom && !autoScroll) {
                    autoScroll = true;
                    autoScrollBtn.classList.add('active');
                    newLogsCount = 0;
                    updateNewLogsButton();
                }
            });
        }

        // Confirmation Modal Functions
        let confirmationCallback = null;

        function showConfirmationModal({ title, message, icon = 'fa-exclamation-triangle', onConfirm }) {
            const modal = document.getElementById('confirmation-modal');
            const titleEl = document.getElementById('confirmation-title');
            const messageEl = document.getElementById('confirmation-message');
            const iconEl = document.getElementById('confirmation-icon');
            
            if (!modal || !titleEl || !messageEl || !iconEl) return;
            
            // Set content
            titleEl.textContent = title;
            messageEl.textContent = message;
            iconEl.className = `fas ${icon}`;
            
            // Store callback
            confirmationCallback = onConfirm;
            
            // Show modal
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeConfirmationModal() {
            const modal = document.getElementById('confirmation-modal');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
                confirmationCallback = null;
            }
        }

        function initConfirmationModalListeners() {
            const modal = document.getElementById('confirmation-modal');
            const closeBtn = document.getElementById('confirmation-modal-close');
            const cancelBtn = document.getElementById('confirmation-cancel');
            const confirmBtn = document.getElementById('confirmation-confirm');
            
            if (closeBtn) {
                closeBtn.addEventListener('click', closeConfirmationModal);
            }
            
            if (cancelBtn) {
                cancelBtn.addEventListener('click', closeConfirmationModal);
            }
            
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => {
                    if (confirmationCallback) {
                        confirmationCallback();
                    }
                    closeConfirmationModal();
                });
            }
            
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target.id === 'confirmation-modal') {
                        closeConfirmationModal();
                    }
                });
            }
        }
