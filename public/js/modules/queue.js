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
    btn.innerHTML = '<i class="fas fa-compact-disc fa-spin"></i> Adding...';
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
            showNotification(`ADDED: ${data.title || 'TRACK'}`, 'success');
            fetchData();
            // Close the modal after successful add
            closeAddTrackModal();
        } else {
            showNotification('FAILED TO ADD', 'error');
        }
    } catch (error) {
        console.error('Error adding song:', error);
        showNotification('CONNECTION ERROR', 'error');
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
        showConfirmationModal({
            title: 'Skip Track',
            message: 'Are you sure you want to skip the current track?',
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
        showNotification('TRACK SKIPPED', 'success');
        fetchData();
    } catch (error) {
        showNotification('SKIP FAILED', 'error');
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
            showNotification(isCurrentlyPaused ? 'RESUMED' : 'PAUSED', 'success');
            fetchData();
        } else {
            showNotification('ACTION FAILED', 'error');
        }
    } catch (error) {
        showNotification('CONNECTION ERROR', 'error');
    }
}

window.removeSong = async function(index) {
    showConfirmationModal({
        title: 'Remove Track',
        message: 'Are you sure you want to remove this track from the queue?',
        icon: 'fa-times',
        onConfirm: async () => {
            try {
                await fetch(`/api/queue/remove/${index}`, { method: 'POST' });
                showNotification('TRACK REMOVED', 'success');
                fetchData();
            } catch (error) {
                showNotification('REMOVAL FAILED', 'error');
            }
        }
    });
};

// Drag and Drop State
let draggedElement = null;
let draggedIndex = null;

function handleDragStart(e) {
    draggedElement = this;
    draggedIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    // Remove all drag-over indicators
    document.querySelectorAll('.queue-item').forEach(item => {
        item.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    if (this !== draggedElement) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    this.classList.remove('drag-over');
    
    if (draggedElement !== this) {
        const dropIndex = parseInt(this.dataset.index);
        
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
                showNotification(`MOVED TO POSITION ${newPosition}`, 'success');
                fetchData();
            } else {
                showNotification('REORDER FAILED', 'error');
            }
        }).catch(err => {
            console.error('Error reordering queue:', err);
            showNotification('REORDER FAILED', 'error');
        });
    }
    
    return false;
}

async function prefetchAll() {
    const btn = document.getElementById('prefetch-btn');
    if (!btn) return;
    
    // Don't allow prefetching if button is disabled (queue is empty)
    if (btn.disabled || btn.classList.contains('disabled')) {
        return;
    }
    
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> DOWNLOADING...';
    btn.disabled = true;
    
    try {
        const response = await fetch('/api/queue/prefetch', { method: 'POST' });
        if (response.ok) {
            showNotification('PREFETCH STARTED', 'success');
            if (typeof fetchData === 'function') {
                fetchData();
            }
        } else {
            showNotification('PREFETCH FAILED', 'error');
        }
    } catch (error) {
        console.error('Error starting prefetch:', error);
        showNotification('CONNECTION ERROR', 'error');
    } finally {
        setTimeout(() => {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }, 2000);
    }
}

async function startNewSession() {
    showConfirmationModal({
        title: 'Start New Session', 
        message: 'Are you sure? This will stop the current song, clear the entire queue, and reset all session statistics.',
        icon: 'fa-redo',
        onConfirm: async () => {
            try {
                const response = await fetch('/api/queue/newsession', {
                    method: 'POST'
                });
                
                if (response.ok) {
                    showNotification('New session started', 'success');
                    if (typeof fetchData === 'function') {
                        fetchData();
                    }
                    // Close settings modal if open
                    closeSettingsModal();
                } else {
                    showNotification('Failed to start new session', 'error');
                }
            } catch (error) {
                console.error('Error starting new session:', error);
                showNotification('Error starting new session', 'error');
            }
        }
    });
}

