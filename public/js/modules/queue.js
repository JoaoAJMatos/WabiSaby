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

// Mouse-based Drag and Drop State (more reliable than HTML5 drag/drop)
let draggedElement = null;
let draggedIndex = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let dropTarget = null;

// Mouse-based drag handlers
function startMouseDrag(e, element) {
    console.log('Starting mouse drag on element:', element.dataset.index);

    draggedElement = element;
    draggedIndex = parseInt(element.dataset.index);
    isDragging = true;

    // Calculate offset from mouse to element
    const rect = element.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    element.classList.add('dragging');
    element.style.opacity = '0.5';
    element.style.transform = 'rotate(2deg)';

    // Add global mouse event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Prevent text selection
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.style.mozUserSelect = 'none';
}

function handleMouseMove(e) {
    if (!isDragging || !draggedElement) return;

    // Update drop target based on mouse position
    const elements = document.querySelectorAll('.queue-item');
    let newDropTarget = null;

    for (const element of elements) {
        if (element === draggedElement) continue;

        const rect = element.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
            newDropTarget = element;
            break;
        }
    }

    // Update visual feedback
    document.querySelectorAll('.queue-item').forEach(item => {
        if (item !== draggedElement) {
            item.classList.remove('drag-over');
        }
    });

    if (newDropTarget && newDropTarget !== draggedElement) {
        newDropTarget.classList.add('drag-over');
    }

    dropTarget = newDropTarget;
}

function handleMouseUp(e) {
    if (!isDragging || !draggedElement) return;

    console.log('Mouse drag ended', {
        draggedIndex: draggedIndex,
        dropTarget: dropTarget ? dropTarget.dataset.index : 'none'
    });

    // Perform reorder if we have a valid drop target
    if (dropTarget && dropTarget !== draggedElement) {
        const dropIndex = parseInt(dropTarget.dataset.index);

        console.log('Reordering from index', draggedIndex, 'to index', dropIndex);

        // Get song title from dragged element for notification
        const songTitleElement = draggedElement.querySelector('.song-title');
        const songTitle = songTitleElement ? songTitleElement.textContent.trim().replace(/\s+/g, ' ') : 'TRACK';
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
            console.log('Reorder API response:', response.status, response.statusText);
            return response.json().then(data => ({ response, data }));
        }).then(({ response, data }) => {
            if (response.ok) {
                const newPosition = dropIndex + 1;
                const movedText = window.i18n?.tSync('ui.dashboard.queue.notifications.movedToPosition', { position: newPosition }) || `MOVED TO POSITION ${newPosition}`;
                showNotification(movedText, 'success');
                fetchData();
            } else {
                console.error('Reorder failed:', data);
                const failedText = window.i18n?.tSync('ui.dashboard.queue.notifications.reorderFailed') || 'REORDER FAILED';
                showNotification(failedText, 'error');
            }
        }).catch(err => {
            console.error('Error reordering queue:', err);
            const failedText = window.i18n?.tSync('ui.dashboard.queue.notifications.reorderFailed') || 'REORDER FAILED';
            showNotification(failedText, 'error');
        });
    }

    // Clean up
    draggedElement.classList.remove('dragging');
    draggedElement.style.opacity = '';
    draggedElement.style.transform = '';

    document.querySelectorAll('.queue-item').forEach(item => {
        item.classList.remove('drag-over');
    });

    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    document.body.style.mozUserSelect = '';

    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    draggedElement = null;
    draggedIndex = null;
    isDragging = false;
    dropTarget = null;
}

// HTML5 drag/drop handlers (fallback - not used for main functionality)
window.handleDragStart = function(e) {
    // Prevent HTML5 drag/drop from interfering
    e.preventDefault();
    return false;
};

window.handleDragEnd = function(e) {
    // Clean up any HTML5 drag state
    this.classList.remove('dragging');
    document.querySelectorAll('.queue-item').forEach(item => {
        item.classList.remove('drag-over');
    });
};

window.handleDragOver = function(e) {
    e.preventDefault();
    return false;
};

window.handleDragEnter = function(e) {
    // No-op for HTML5
};

window.handleDragLeave = function(e) {
    // No-op for HTML5
};

window.handleDrop = function(e) {
    e.preventDefault();
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

