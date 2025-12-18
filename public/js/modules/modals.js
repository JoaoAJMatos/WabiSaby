/**
 * Modal Management
 * Handles all modal dialogs (settings, add track, confirmation)
 */

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

// Settings Modal Functions
function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
        
        // Clear any previous search
        const searchInput = document.getElementById('settings-search');
        if (searchInput) {
            searchInput.value = '';
            const clearBtn = document.getElementById('settings-search-clear');
            if (clearBtn) clearBtn.classList.add('hidden');
        }
        
        // Auto-open groups panel if no groups configured
        const currentGroupsCount = window.groupsCount || 0;
        if (currentGroupsCount === 0 && typeof switchSettingsPanel === 'function') {
            // Small delay to ensure modal is fully rendered
            setTimeout(() => {
                switchSettingsPanel('groups');
            }, 100);
        } else if (typeof switchSettingsPanel === 'function') {
            // Reset to first panel if groups are configured
            switchSettingsPanel('download');
        }
    }
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // Restore scroll
        
        // Stop polling for pending confirmations when modal closes
        if (typeof stopPendingConfirmationsPolling === 'function') {
            stopPendingConfirmationsPolling();
        }
        
        // Stop disk usage polling when modal closes
        if (typeof stopDiskUsagePolling === 'function') {
            stopDiskUsagePolling();
        }
    }
}

// Add Track Modal Functions
function openAddTrackModal() {
    const modal = document.getElementById('add-track-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        // Focus the input field
        setTimeout(() => {
            const input = document.getElementById('song-url');
            if (input) input.focus();
        }, 100);
    }
}

function closeAddTrackModal() {
    const modal = document.getElementById('add-track-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function initAddTrackModalListeners() {
    const addBtn = document.getElementById('add-song-btn');
    const closeBtn = document.getElementById('add-track-modal-close');
    const modal = document.getElementById('add-track-modal');
    
    if (addBtn) {
        addBtn.addEventListener('click', openAddTrackModal);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeAddTrackModal);
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'add-track-modal') {
                closeAddTrackModal();
            }
        });
    }
}

