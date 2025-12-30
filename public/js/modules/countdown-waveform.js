/**
 * Countdown Waveform Module
 * Interactive waveform visualization for countdown song timestamp selection
 */

(function() {
    'use strict';

    // Module state
    let waveformData = null;
    let canvas = null;
    let ctx = null;
    let marker = null;
    let container = null;
    let timestampDisplay = null;
    let timeAxisEl = null;
    let currentTimestamp = 0; // in seconds
    let isDragging = false;
    let pollInterval = null;
    let isLoading = false;

    // Constants
    const POLL_INTERVAL = 2000; // Poll every 2 seconds while loading
    const WAVEFORM_COLORS = {
        gradient1: 'rgba(52, 211, 153, 0.8)',   // Primary green
        gradient2: 'rgba(167, 139, 250, 0.6)',  // Secondary purple
        gradientBg1: 'rgba(52, 211, 153, 0.15)',
        gradientBg2: 'rgba(167, 139, 250, 0.1)',
        marker: '#34d399',
        markerGlow: 'rgba(52, 211, 153, 0.4)',
        axis: 'rgba(255, 255, 255, 0.3)',
        axisText: 'rgba(255, 255, 255, 0.5)'
    };

    /**
     * Initialize the waveform module
     */
    function init() {
        container = document.getElementById('countdown-waveform-container');
        canvas = document.getElementById('countdown-waveform-canvas');
        marker = document.getElementById('countdown-waveform-marker');
        timestampDisplay = document.getElementById('countdown-timestamp-display');
        timeAxisEl = document.getElementById('countdown-time-axis');

        if (!container || !canvas) {
            console.debug('Waveform elements not found');
            return;
        }

        ctx = canvas.getContext('2d');

        // Set up resize observer for responsive canvas
        const resizeObserver = new ResizeObserver(() => {
            resizeCanvas();
            if (waveformData) {
                render();
            }
        });
        resizeObserver.observe(container);

        // Set up drag handlers
        setupDragHandlers();

        // Set up canvas click handler
        canvas.addEventListener('click', handleCanvasClick);

        console.log('Countdown waveform module initialized');
    }

    /**
     * Resize canvas to match container
     */
    function resizeCanvas() {
        if (!canvas || !container) return;

        const rect = container.querySelector('.waveform-visual').getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        ctx.scale(dpr, dpr);
    }

    /**
     * Load waveform data from API
     * @returns {Promise<Object|null>}
     */
    async function loadWaveform() {
        if (isLoading) return null;

        setLoadingState(true);

        try {
            const res = await fetch('/api/countdown/waveform');
            const data = await res.json();

            if (!data.success) {
                setErrorState(data.error || 'Failed to load waveform');
                return null;
            }

            // Handle different statuses
            switch (data.status) {
                case 'ready':
                    waveformData = data.waveform;
                    stopPolling();
                    setLoadingState(false);
                    resizeCanvas();
                    render();
                    updateTimeAxis();
                    return waveformData;

                case 'prefetching':
                    setLoadingMessage('Downloading song...');
                    startPolling();
                    return null;

                case 'generating':
                    setLoadingMessage('Generating waveform...');
                    startPolling();
                    return null;

                case 'not_prefetched':
                    setLoadingMessage('Song not downloaded. Click to download.');
                    return null;

                default:
                    setErrorState('Unknown status');
                    return null;
            }
        } catch (error) {
            console.error('Failed to load waveform:', error);
            setErrorState('Network error');
            return null;
        }
    }

    /**
     * Start polling for waveform data
     */
    function startPolling() {
        if (pollInterval) return;

        pollInterval = setInterval(async () => {
            const data = await loadWaveform();
            if (data) {
                stopPolling();
            }
        }, POLL_INTERVAL);
    }

    /**
     * Stop polling
     */
    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    /**
     * Set loading state
     */
    function setLoadingState(loading) {
        isLoading = loading;
        if (!container) return;

        container.classList.toggle('loading', loading);

        if (loading) {
            container.classList.remove('error');
            container.classList.remove('ready');
        } else if (waveformData) {
            container.classList.add('ready');
        }
    }

    /**
     * Set loading message
     */
    function setLoadingMessage(message) {
        const loadingText = container?.querySelector('.waveform-loading-text');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }

    /**
     * Set error state
     */
    function setErrorState(message) {
        isLoading = false;
        stopPolling();

        if (!container) return;

        container.classList.remove('loading');
        container.classList.add('error');

        const errorText = container.querySelector('.waveform-error-text');
        if (errorText) {
            errorText.textContent = message;
        }
    }

    /**
     * Render waveform on canvas
     */
    function render() {
        if (!ctx || !canvas || !waveformData) return;

        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        const samples = waveformData.samples;
        const sampleCount = samples.length;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Calculate bar width
        const barWidth = width / sampleCount;
        const centerY = height / 2;
        const maxBarHeight = (height / 2) - 4; // Leave some padding

        // Create gradient for bars
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, WAVEFORM_COLORS.gradient1);
        gradient.addColorStop(0.5, WAVEFORM_COLORS.gradient2);
        gradient.addColorStop(1, WAVEFORM_COLORS.gradient1);

        // Draw mirrored waveform
        ctx.fillStyle = gradient;

        for (let i = 0; i < sampleCount; i++) {
            const amplitude = samples[i];
            const barHeight = amplitude * maxBarHeight;

            const x = i * barWidth;

            // Draw top half (positive)
            ctx.fillRect(x, centerY - barHeight, Math.max(1, barWidth - 0.5), barHeight);

            // Draw bottom half (mirrored)
            ctx.fillRect(x, centerY, Math.max(1, barWidth - 0.5), barHeight);
        }

        // Draw center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        // Update marker position
        updateMarkerPosition();
    }

    /**
     * Update time axis labels
     */
    function updateTimeAxis() {
        if (!timeAxisEl || !waveformData) return;

        const duration = waveformData.duration;
        timeAxisEl.innerHTML = '';

        // Calculate good interval for labels (every 10-30 seconds depending on duration)
        let interval;
        if (duration <= 60) {
            interval = 10;
        } else if (duration <= 180) {
            interval = 30;
        } else if (duration <= 300) {
            interval = 60;
        } else {
            interval = 60;
        }

        // Generate time labels
        for (let time = 0; time <= duration; time += interval) {
            const position = (time / duration) * 100;
            const tick = document.createElement('div');
            tick.className = 'waveform-time-tick';
            tick.style.left = `${position}%`;

            const label = document.createElement('span');
            label.className = 'waveform-time-label';
            label.textContent = formatTime(time);

            tick.appendChild(label);
            timeAxisEl.appendChild(tick);
        }

        // Add end time if not at interval
        const lastLabelTime = Math.floor(duration / interval) * interval;
        if (duration - lastLabelTime > interval / 2) {
            const position = 100;
            const tick = document.createElement('div');
            tick.className = 'waveform-time-tick';
            tick.style.left = `${position}%`;

            const label = document.createElement('span');
            label.className = 'waveform-time-label';
            label.textContent = formatTime(duration);

            tick.appendChild(label);
            timeAxisEl.appendChild(tick);
        }
    }

    /**
     * Format time in M:SS format
     */
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Convert pixel X position to time (seconds)
     */
    function pixelToTime(pixelX) {
        if (!waveformData || !container) return 0;

        const visual = container.querySelector('.waveform-visual');
        const rect = visual.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (pixelX - rect.left) / rect.width));

        return percentage * waveformData.duration;
    }

    /**
     * Convert time (seconds) to pixel X position
     */
    function timeToPixel(time) {
        if (!waveformData || !container) return 0;

        const visual = container.querySelector('.waveform-visual');
        const rect = visual.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, time / waveformData.duration));

        return percentage * rect.width;
    }

    /**
     * Update marker position based on current timestamp
     */
    function updateMarkerPosition() {
        if (!marker || !waveformData) return;

        const percentage = Math.max(0, Math.min(100, (currentTimestamp / waveformData.duration) * 100));
        marker.style.left = `${percentage}%`;

        // Update timestamp display
        if (timestampDisplay) {
            timestampDisplay.textContent = formatTime(currentTimestamp);
        }
    }

    /**
     * Set timestamp and update UI
     */
    function setTimestamp(seconds) {
        if (!waveformData) return;

        currentTimestamp = Math.max(0, Math.min(waveformData.duration, seconds));
        updateMarkerPosition();
    }

    /**
     * Get current timestamp
     */
    function getTimestamp() {
        return currentTimestamp;
    }

    /**
     * Handle canvas click to jump marker
     */
    function handleCanvasClick(e) {
        if (!waveformData || isDragging) return;

        const time = pixelToTime(e.clientX);
        setTimestamp(time);

        // Trigger save
        saveTimestamp();
    }

    /**
     * Set up drag handlers for marker
     */
    function setupDragHandlers() {
        if (!marker) return;

        // Mouse events
        marker.addEventListener('mousedown', handleDragStart);
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);

        // Touch events
        marker.addEventListener('touchstart', handleDragStart, { passive: false });
        document.addEventListener('touchmove', handleDragMove, { passive: false });
        document.addEventListener('touchend', handleDragEnd);
    }

    /**
     * Handle drag start
     */
    function handleDragStart(e) {
        if (!waveformData) return;

        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        marker.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
    }

    /**
     * Handle drag move
     */
    function handleDragMove(e) {
        if (!isDragging || !waveformData) return;

        e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const time = pixelToTime(clientX);
        setTimestamp(time);
    }

    /**
     * Handle drag end
     */
    function handleDragEnd(e) {
        if (!isDragging) return;

        isDragging = false;
        marker.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        // Save timestamp on drag end
        saveTimestamp();
    }

    /**
     * Save timestamp to settings
     */
    function saveTimestamp() {
        // Update the hidden timestamp input
        const timestampInput = document.getElementById('setting-countdownSongTimestamp');
        if (timestampInput) {
            timestampInput.value = formatTime(currentTimestamp);

            // Trigger input event to save via settings.js
            timestampInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /**
     * Load initial timestamp from settings
     */
    function loadInitialTimestamp() {
        const timestampInput = document.getElementById('setting-countdownSongTimestamp');
        if (timestampInput && timestampInput.value) {
            const parts = timestampInput.value.split(':');
            if (parts.length === 2) {
                const minutes = parseInt(parts[0], 10) || 0;
                const seconds = parseInt(parts[1], 10) || 0;
                currentTimestamp = minutes * 60 + seconds;
            }
        }
    }

    /**
     * Reset waveform state (called when song URL changes)
     */
    function reset() {
        waveformData = null;
        currentTimestamp = 0;
        stopPolling();

        if (container) {
            container.classList.remove('ready', 'error', 'loading');
        }

        if (ctx && canvas) {
            const width = canvas.width / (window.devicePixelRatio || 1);
            const height = canvas.height / (window.devicePixelRatio || 1);
            ctx.clearRect(0, 0, width, height);
        }

        if (timeAxisEl) {
            timeAxisEl.innerHTML = '';
        }

        if (timestampDisplay) {
            timestampDisplay.textContent = '0:00';
        }

        updateMarkerPosition();
    }

    /**
     * Trigger waveform load when song is set
     */
    async function triggerLoad() {
        reset();
        setLoadingState(true);
        setLoadingMessage('Loading...');

        // First trigger prefetch if needed
        try {
            await fetch('/api/countdown/prefetch', { method: 'POST' });
        } catch (e) {
            // Ignore prefetch errors
        }

        // Load initial timestamp
        loadInitialTimestamp();

        // Then try to load waveform
        await loadWaveform();
    }

    /**
     * Check if waveform is ready
     */
    function isReady() {
        return waveformData !== null;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export module
    window.countdownWaveform = {
        init,
        loadWaveform,
        triggerLoad,
        reset,
        setTimestamp,
        getTimestamp,
        isReady,
        render
    };

})();
