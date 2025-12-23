/**
 * Queue Management Module
 * Handles queue operations: add, skip, pause, remove, prefetch, drag & drop
 */

// Store skip confirmation setting
let skipConfirmationEnabled = true;
let showRequesterNameEnabled = true;

async function addSong(e) {
    e.preventDefault();
    const urlInput = document.getElementById('song-url');
    const requesterInput = document.getElementById('requester-name');
    const btn = e.target.querySelector('button');
    
    const url = urlInput.value;
    const requester = requesterInput.value;

    const originalBtnContent = btn.innerHTML;
    const addingText = window.i18n?.tSync('ui.dashboard.queue.notifications.adding') || 'Adding...';
    btn.innerHTML = `<i class="fas fa-compact-disc fa-spin"></i> ${addingText}`;
    btn.disabled = true;

    try {
        const response = await fetch('/api/queue/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, requester })
        });
        
        if (response.ok) {
            const data = await response.json();
            urlInput.value = '';
            const addedText = window.i18n?.tSync('ui.dashboard.queue.notifications.added', { title: data.title || 'TRACK' }) || `ADDED: ${data.title || 'TRACK'}`;
            showNotification(addedText, 'success');
            fetchData();
            // Close the modal after successful add
            closeAddTrackModal();
        } else {
            const failedText = window.i18n?.tSync('ui.dashboard.queue.notifications.failedToAdd') || 'FAILED TO ADD';
            showNotification(failedText, 'error');
        }
    } catch (error) {
        console.error('Error adding song:', error);
        const errorText = window.i18n?.tSync('ui.dashboard.queue.notifications.connectionError') || 'CONNECTION ERROR';
        showNotification(errorText, 'error');
    } finally {
        btn.innerHTML = originalBtnContent;
        btn.disabled = false;
    }
}

async function skipSong() {
    // Check if confirmation is enabled
    const confirmSkipSetting = document.getElementById('setting-confirmSkip');
    const shouldConfirm = confirmSkipSetting ? confirmSkipSetting.checked : skipConfirmationEnabled;
    
    if (shouldConfirm) {
        const skipTitle = window.i18n?.tSync('ui.dashboard.queue.notifications.skipTrack') || 'Skip Track';
        const skipMessage = window.i18n?.tSync('ui.dashboard.queue.notifications.skipConfirm') || 'Are you sure you want to skip the current track?';
        showConfirmationModal({
            title: skipTitle,
            message: skipMessage,
            icon: 'fa-forward',
            onConfirm: async () => {
                await performSkip();
            }
        });
    } else {
        // Skip directly without confirmation
        await performSkip();
    }
}

async function performSkip() {
    try {
        await fetch('/api/queue/skip', { method: 'POST' });
        const skippedText = window.i18n?.tSync('ui.dashboard.queue.notifications.trackSkipped') || 'TRACK SKIPPED';
        showNotification(skippedText, 'success');
        fetchData();
    } catch (error) {
        const failedText = window.i18n?.tSync('ui.dashboard.queue.notifications.skipFailed') || 'SKIP FAILED';
        showNotification(failedText, 'error');
    }
}

async function togglePause() {
    const btn = document.getElementById('play-pause-btn');
    
    // Don't allow toggling if button is disabled (no song)
    if (btn.disabled) {
        return;
    }
    
    const isCurrentlyPaused = btn.getAttribute('data-paused') === 'true';
    const endpoint = isCurrentlyPaused ? '/api/queue/resume' : '/api/queue/pause';
    
    try {
        const res = await fetch(endpoint, { method: 'POST' });
        if (res.ok) {
            const statusKey = isCurrentlyPaused ? 'ui.dashboard.queue.notifications.resumed' : 'ui.dashboard.queue.notifications.paused';
            const statusText = window.i18n?.tSync(statusKey) || (isCurrentlyPaused ? 'RESUMED' : 'PAUSED');
            showNotification(statusText, 'success');
            fetchData();
        } else {
            const failedText = window.i18n?.tSync('ui.dashboard.queue.notifications.actionFailed') || 'ACTION FAILED';
            showNotification(failedText, 'error');
        }
    } catch (error) {
        const errorText = window.i18n?.tSync('ui.dashboard.queue.notifications.connectionError') || 'CONNECTION ERROR';
        showNotification(errorText, 'error');
    }
}

window.removeSong = async function(index) {
    const removeTitle = window.i18n?.tSync('ui.dashboard.queue.notifications.removeTrack') || 'Remove Track';
    const removeMessage = window.i18n?.tSync('ui.dashboard.queue.notifications.removeConfirm') || 'Are you sure you want to remove this track from the queue?';
    showConfirmationModal({
        title: removeTitle,
        message: removeMessage,
        icon: 'fa-times',
        onConfirm: async () => {
            try {
                await fetch(`/api/queue/remove/${index}`, { method: 'POST' });
                const removedText = window.i18n?.tSync('ui.dashboard.queue.notifications.trackRemoved') || 'TRACK REMOVED';
                showNotification(removedText, 'success');
                fetchData();
            } catch (error) {
                const failedText = window.i18n?.tSync('ui.dashboard.queue.notifications.removalFailed') || 'REMOVAL FAILED';
                showNotification(failedText, 'error');
            }
        }
    });
};

// Drag and Drop State
let draggedElement = null;
let draggedIndex = null;

// Attach drag handlers to window for global access
window.handleDragStart = function(e) {
    // Don't start drag if clicking on remove button
    if (e.target.closest('.queue-remove-btn')) {
        e.preventDefault();
        return false;
    }
    
    console.log('Drag started on queue item', this.dataset.index);
    draggedElement = this;
    draggedIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    return true;
};

window.handleDragEnd = function(e) {
    this.classList.remove('dragging');
    // Remove all drag-over indicators
    document.querySelectorAll('.queue-item').forEach(item => {
        item.classList.remove('drag-over');
    });
};

window.handleDragOver = function(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
};

window.handleDragEnter = function(e) {
    if (this !== draggedElement) {
        this.classList.add('drag-over');
    }
};

window.handleDragLeave = function(e) {
    this.classList.remove('drag-over');
};

window.handleDrop = function(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    e.preventDefault();
    this.classList.remove('drag-over');
    
    if (draggedElement !== this) {
        const dropIndex = parseInt(this.dataset.index);
        console.log('Dropped item from index', draggedIndex, 'to index', dropIndex);
        
        // Get song title from dragged element for notification
        const songTitleElement = draggedElement.querySelector('.song-title');
        const songTitle = songTitleElement ? songTitleElement.textContent.trim().replace(/\s+/g, ' ') : 'TRACK';
        // Remove priority icon if present
        const cleanTitle = songTitle.replace(/\s*👑\s*/g, '').trim() || 'TRACK';
        
        // Reorder queue on backend
        fetch('/api/queue/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fromIndex: draggedIndex, 
                toIndex: dropIndex
            })
        }).then(response => {
            if (response.ok) {
                const newPosition = dropIndex + 1; // Position is 1-based for display
                const movedText = window.i18n?.tSync('ui.dashboard.queue.notifications.movedToPosition', { position: newPosition }) || `MOVED TO POSITION ${newPosition}`;
                showNotification(movedText, 'success');
                fetchData();
            } else {
                const failedText = window.i18n?.tSync('ui.dashboard.queue.notifications.reorderFailed') || 'REORDER FAILED';
                showNotification(failedText, 'error');
            }
        }).catch(err => {
            console.error('Error reordering queue:', err);
            const failedText = window.i18n?.tSync('ui.dashboard.queue.notifications.reorderFailed') || 'REORDER FAILED';
            showNotification(failedText, 'error');
        });
    }
    
    return false;
};

async function prefetchAll() {
    const btn = document.getElementById('prefetch-btn');
    if (!btn) return;
    
    // Don't allow prefetching if button is disabled (queue is empty)
    if (btn.disabled || btn.classList.contains('disabled')) {
        return;
    }
    
    const originalContent = btn.innerHTML;
    const downloadingText = window.i18n?.tSync('ui.dashboard.queue.notifications.downloadingBtn') || 'DOWNLOADING...';
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${downloadingText}`;
    btn.disabled = true;
    
    try {
        const response = await fetch('/api/queue/prefetch', { method: 'POST' });
        if (response.ok) {
            const startedText = window.i18n?.tSync('ui.dashboard.queue.notifications.prefetchStarted') || 'PREFETCH STARTED';
            showNotification(startedText, 'success');
            if (typeof fetchData === 'function') {
                fetchData();
            }
        } else {
            const failedText = window.i18n?.tSync('ui.dashboard.queue.notifications.prefetchFailed') || 'PREFETCH FAILED';
            showNotification(failedText, 'error');
        }
    } catch (error) {
        console.error('Error starting prefetch:', error);
        const errorText = window.i18n?.tSync('ui.dashboard.queue.notifications.connectionError') || 'CONNECTION ERROR';
        showNotification(errorText, 'error');
    } finally {
        setTimeout(() => {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }, 2000);
    }
}

async function startNewSession() {
    const sessionTitle = window.i18n?.tSync('ui.dashboard.queue.notifications.startNewSession') || 'Start New Session';
    const sessionMessage = window.i18n?.tSync('ui.dashboard.queue.notifications.newSessionConfirm') || 'Are you sure? This will stop the current song, clear the entire queue, and reset all session statistics.';
    showConfirmationModal({
        title: sessionTitle, 
        message: sessionMessage,
        icon: 'fa-redo',
        onConfirm: async () => {
            try {
                const response = await fetch('/api/queue/newsession', {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const startedText = window.i18n?.tSync('ui.dashboard.queue.notifications.newSessionStarted') || 'New session started';
                    showNotification(startedText, 'success');
                    if (typeof fetchData === 'function') {
                        fetchData();
                    }
                    // Close settings modal if open
                    closeSettingsModal();
                } else {
                    const failedText = window.i18n?.tSync('ui.dashboard.queue.notifications.newSessionFailed') || 'Failed to start new session';
                    showNotification(failedText, 'error');
                }
            } catch (error) {
                console.error('Error starting new session:', error);
                const errorText = window.i18n?.tSync('ui.dashboard.queue.notifications.newSessionError') || 'Error starting new session';
                showNotification(errorText, 'error');
            }
        }
    });
}

