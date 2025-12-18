/**
 * Groups Management Module
 * Handles groups loading, add/remove, and pending confirmations
 */

// Polling interval for pending confirmations
let pendingConfirmationsPollInterval = null;
const PENDING_CONFIRMATIONS_POLL_INTERVAL = 3000; // Poll every 3 seconds

function startPendingConfirmationsPolling() {
    // Clear any existing interval
    stopPendingConfirmationsPolling();
    
    // Start polling for pending confirmations
    pendingConfirmationsPollInterval = setInterval(() => {
        // Only poll if groups panel is visible
        const groupsPanel = document.querySelector('.settings-panel[data-panel="groups"]');
        if (groupsPanel && groupsPanel.classList.contains('active')) {
            loadPendingConfirmations();
        } else {
            // Panel is not visible, stop polling
            stopPendingConfirmationsPolling();
        }
    }, PENDING_CONFIRMATIONS_POLL_INTERVAL);
}

function stopPendingConfirmationsPolling() {
    if (pendingConfirmationsPollInterval) {
        clearInterval(pendingConfirmationsPollInterval);
        pendingConfirmationsPollInterval = null;
    }
}

async function loadGroups() {
    const container = document.getElementById('groups-list');
    const countEl = document.getElementById('groups-count');
    
    if (!container) return;
    
    try {
        container.innerHTML = '<div class="groups-loading"><i class="fas fa-circle-notch fa-spin"></i><span>Loading groups...</span></div>';
        
        const res = await fetch('/api/groups');
        if (!res.ok) throw new Error('Failed to fetch groups');
        
        const data = await res.json();
        const groups = data.groups || [];
        
        if (countEl) {
            countEl.textContent = groups.length;
        }
        
        if (groups.length === 0) {
            // Simple empty state
            container.innerHTML = '<div class="groups-empty"><span>No groups added yet</span></div>';
        } else {
            container.innerHTML = groups.map(group => {
                const addedDate = group.addedAt ? new Date(group.addedAt).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                }) : 'Unknown';
                return `
                    <div class="groups-card" data-group-id="${group.id}">
                        <div class="groups-card-header">
                            <div class="groups-card-icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="groups-card-content">
                                <div class="groups-card-name-display">${escapeHtml(group.name)}</div>
                                <div class="groups-card-name-edit" style="display: none;">
                                    <input type="text" class="groups-card-input" value="${escapeHtml(group.name)}" data-group-id="${group.id}" maxlength="100" placeholder="Group name">
                                </div>
                                <div class="groups-card-meta">
                                    <span class="groups-card-id">
                                        <i class="fas fa-hashtag"></i>
                                        <span>${escapeHtml(group.id)}</span>
                                    </span>
                                    <span class="groups-card-date">
                                        <i class="fas fa-calendar-plus"></i>
                                        <span>${addedDate}</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="groups-card-actions">
                            <button type="button" class="groups-action-btn groups-action-edit" onclick="editGroup('${group.id}')" title="Edit name">
                                <i class="fas fa-pencil-alt"></i>
                                <span>Edit</span>
                            </button>
                            <button type="button" class="groups-action-btn groups-action-save" onclick="saveGroupName('${group.id}')" style="display: none;" title="Save changes">
                                <i class="fas fa-check"></i>
                                <span>Save</span>
                            </button>
                            <button type="button" class="groups-action-btn groups-action-cancel" onclick="cancelEditGroup('${group.id}')" style="display: none;" title="Cancel">
                                <i class="fas fa-times"></i>
                                <span>Cancel</span>
                            </button>
                            <button type="button" class="groups-action-btn groups-action-remove" onclick="removeGroup('${group.id}')" title="Remove group">
                                <i class="fas fa-trash-alt"></i>
                                <span>Remove</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading groups:', error);
        container.innerHTML = '<div class="groups-error"><i class="fas fa-exclamation-triangle"></i><span>Failed to load groups</span></div>';
    }
    
    // Also load pending confirmations
    await loadPendingConfirmations();
    
    // Start polling for new pending confirmations when groups panel is visible
    const groupsPanel = document.querySelector('.settings-panel[data-panel="groups"]');
    if (groupsPanel && groupsPanel.classList.contains('active')) {
        startPendingConfirmationsPolling();
    }
}

async function loadPendingConfirmations() {
    const container = document.getElementById('groups-pending-list');
    const pendingContainer = document.getElementById('groups-pending-container');
    const countEl = document.getElementById('pending-count');
    
    if (!container) return;
    
    try {
        const res = await fetch('/api/groups/pending');
        if (!res.ok) throw new Error('Failed to fetch pending confirmations');
        
        const data = await res.json();
        const pending = data.pending || [];
        
        if (countEl) {
            countEl.textContent = pending.length;
        }
        
        if (pending.length === 0) {
            if (pendingContainer) pendingContainer.style.display = 'none';
            return;
        }
        
        if (pendingContainer) pendingContainer.style.display = 'block';
        
        container.innerHTML = pending.map(confirmation => {
            const timeAgo = getTimeAgo(confirmation.timestamp);
            return `
                <div class="groups-item groups-item-pending" data-group-id="${confirmation.groupId}">
                    <div class="groups-item-info">
                        <div class="groups-item-name">${escapeHtml(confirmation.groupName)}</div>
                        <div class="groups-item-id">${escapeHtml(confirmation.groupId)}</div>
                        <div class="groups-item-meta">
                            <span><i class="fas fa-user"></i> ${escapeHtml(confirmation.senderName)}</span>
                            <span><i class="fas fa-clock"></i> ${timeAgo}</span>
                        </div>
                    </div>
                    <div class="groups-item-actions">
                        <button type="button" class="groups-confirm-btn" onclick="confirmGroup('${confirmation.groupId}')" title="Confirm">
                            <i class="fas fa-check"></i>
                        </button>
                        <button type="button" class="groups-reject-btn" onclick="rejectGroup('${confirmation.groupId}')" title="Reject">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading pending confirmations:', error);
        if (pendingContainer) pendingContainer.style.display = 'none';
    }
}

async function addGroup(groupId) {
    if (!groupId || !groupId.includes('@g.us')) {
        showConfirmationModal({
            title: 'Invalid Group ID',
            message: 'Group ID must be a WhatsApp group ID (ending with @g.us)',
            icon: 'fa-exclamation-triangle',
            onConfirm: () => {}
        });
        return;
    }
    
    showConfirmationModal({
        title: 'Add Group',
        message: `Add group "${groupId}" to monitoring? The bot will start listening to messages from this group.`,
        icon: 'fa-plus-circle',
        onConfirm: async () => {
            try {
                const res = await fetch('/api/groups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ groupId })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    await loadGroups();
                    // Trigger status update to refresh hints immediately
                    if (typeof fetchData === 'function') {
                        fetchData();
                    }
                    if (typeof showSaveIndicator === 'function') {
                        showSaveIndicator();
                    }
                } else {
                    showConfirmationModal({
                        title: 'Error',
                        message: data.error || 'Failed to add group',
                        icon: 'fa-exclamation-triangle',
                        onConfirm: () => {}
                    });
                }
            } catch (error) {
                console.error('Error adding group:', error);
                showConfirmationModal({
                    title: 'Error',
                    message: 'Failed to add group. Please try again.',
                    icon: 'fa-exclamation-triangle',
                    onConfirm: () => {}
                });
            }
        }
    });
}

window.removeGroup = async function(groupId) {
    // Get group name for better confirmation message
    let groupName = groupId;
    try {
        const res = await fetch('/api/groups');
        if (res.ok) {
            const data = await res.json();
            const group = data.groups?.find(g => g.id === groupId);
            if (group) {
                groupName = group.name;
            }
        }
    } catch (e) {
        // Ignore error, use groupId as fallback
    }
    
    showConfirmationModal({
        title: 'Remove Group',
        message: `Are you sure you want to remove "${groupName}" from monitoring? The bot will stop listening to messages from this group.`,
        icon: 'fa-trash',
        onConfirm: async () => {
            try {
                const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, {
                    method: 'DELETE'
                });
                
                const data = await res.json();
                
                if (data.success) {
                    await loadGroups();
                    // Trigger status update to refresh hints immediately
                    if (typeof fetchData === 'function') {
                        fetchData();
                    }
                    if (typeof showSaveIndicator === 'function') {
                        showSaveIndicator();
                    }
                } else {
                    showConfirmationModal({
                        title: 'Error',
                        message: data.error || 'Failed to remove group',
                        icon: 'fa-exclamation-triangle',
                        onConfirm: () => {}
                    });
                }
            } catch (error) {
                console.error('Error removing group:', error);
                showConfirmationModal({
                    title: 'Error',
                    message: 'Failed to remove group. Please try again.',
                    icon: 'fa-exclamation-triangle',
                    onConfirm: () => {}
                });
            }
        }
    });
};

async function confirmGroup(groupId) {
    // Get group info for confirmation message
    let groupName = groupId;
    let senderName = 'Unknown';
    try {
        const res = await fetch('/api/groups/pending');
        if (res.ok) {
            const data = await res.json();
            const pending = data.pending?.find(p => p.groupId === groupId);
            if (pending) {
                groupName = pending.groupName;
                senderName = pending.senderName;
            }
        }
    } catch (e) {
        // Ignore error, use defaults
    }
    
    showConfirmationModal({
        title: 'Confirm Group',
        message: `Add "${groupName}" to monitored groups? This group was requested by ${senderName}.`,
        icon: 'fa-check-circle',
        onConfirm: async () => {
            try {
                const res = await fetch(`/api/groups/pending/${encodeURIComponent(groupId)}/confirm`, {
                    method: 'POST'
                });
                
                const data = await res.json();
                
                if (data.success) {
                    await loadGroups();
                    // Trigger status update to refresh hints immediately
                    if (typeof fetchData === 'function') {
                        fetchData();
                    }
                    if (typeof showSaveIndicator === 'function') {
                        showSaveIndicator();
                    }
                } else {
                    showConfirmationModal({
                        title: 'Error',
                        message: data.error || 'Failed to confirm group',
                        icon: 'fa-exclamation-triangle',
                        onConfirm: () => {}
                    });
                }
            } catch (error) {
                console.error('Error confirming group:', error);
                showConfirmationModal({
                    title: 'Error',
                    message: 'Failed to confirm group. Please try again.',
                    icon: 'fa-exclamation-triangle',
                    onConfirm: () => {}
                });
            }
        }
    });
}

async function rejectGroup(groupId) {
    try {
        const res = await fetch(`/api/groups/pending/${encodeURIComponent(groupId)}/reject`, {
            method: 'POST'
        });
        
        const data = await res.json();
        
        if (data.success) {
            await loadPendingConfirmations();
        } else {
            showNotification('Failed to reject group', 'error');
        }
    } catch (error) {
        console.error('Error rejecting group:', error);
        showNotification('Failed to reject group', 'error');
    }
}

window.editGroup = function(groupId) {
    const card = document.querySelector(`.groups-card[data-group-id="${groupId}"]`);
    if (!card) return;
    
    const nameDisplay = card.querySelector('.groups-card-name-display');
    const nameEdit = card.querySelector('.groups-card-name-edit');
    const editBtn = card.querySelector('.groups-action-edit');
    const saveBtn = card.querySelector('.groups-action-save');
    const cancelBtn = card.querySelector('.groups-action-cancel');
    const removeBtn = card.querySelector('.groups-action-remove');
    const editInput = card.querySelector('.groups-card-input');
    
    if (nameDisplay && nameEdit && editBtn && saveBtn && cancelBtn && editInput) {
        // Add editing class for visual feedback
        card.classList.add('groups-card-editing');
        
        // Smooth transition
        nameDisplay.style.opacity = '0';
        setTimeout(() => {
            nameDisplay.style.display = 'none';
            nameEdit.style.display = 'block';
            nameEdit.style.opacity = '0';
            setTimeout(() => {
                nameEdit.style.opacity = '1';
            }, 10);
        }, 150);
        
        editBtn.style.display = 'none';
        saveBtn.style.display = 'flex';
        cancelBtn.style.display = 'flex';
        removeBtn.style.display = 'none';
        
        // Focus and select after a brief delay to ensure display transition completes
        setTimeout(() => {
            editInput.focus();
            editInput.select();
        }, 200);
        
        // Add Enter key handler
        const handleKeyPress = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveGroupName(groupId);
                editInput.removeEventListener('keydown', handleKeyPress);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEditGroup(groupId);
                editInput.removeEventListener('keydown', handleKeyPress);
            }
        };
        
        editInput.addEventListener('keydown', handleKeyPress);
    }
};

window.saveGroupName = async function(groupId) {
    const card = document.querySelector(`.groups-card[data-group-id="${groupId}"]`);
    if (!card) return;
    
    const editInput = card.querySelector('.groups-card-input');
    const saveBtn = card.querySelector('.groups-action-save');
    const cancelBtn = card.querySelector('.groups-action-cancel');
    
    if (!editInput || !saveBtn || !cancelBtn) return;
    
    const newName = editInput.value.trim();
    
    if (!newName) {
        showNotification('Group name cannot be empty', 'error');
        editInput.focus();
        return;
    }
    
    // Show loading state
    const originalSaveContent = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Saving...</span>';
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    editInput.disabled = true;
    card.classList.add('groups-card-saving');
    
    try {
        const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        
        const data = await res.json();
        
        if (data.success) {
            // Show success state briefly before reloading
            card.classList.remove('groups-card-saving');
            card.classList.add('groups-card-saved');
            
            setTimeout(async () => {
                await loadGroups();
                // Trigger status update to refresh hints immediately
                if (typeof fetchData === 'function') {
                    fetchData();
                }
                if (typeof showSaveIndicator === 'function') {
                    showSaveIndicator();
                }
                // Refresh VIP member list if it's loaded (to update group badges)
                if (typeof fetchGroupMembers === 'function') {
                    fetchGroupMembers();
                }
                showNotification('Group name updated successfully', 'success');
            }, 300);
        } else {
            // Restore button state
            saveBtn.innerHTML = originalSaveContent;
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            editInput.disabled = false;
            card.classList.remove('groups-card-saving');
            
            showNotification(data.error || 'Failed to update group name', 'error');
            // Restore original name on error
            cancelEditGroup(groupId);
        }
    } catch (error) {
        console.error('Error updating group name:', error);
        
        // Restore button state
        saveBtn.innerHTML = originalSaveContent;
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        editInput.disabled = false;
        card.classList.remove('groups-card-saving');
        
        showNotification('Failed to update group name. Please try again.', 'error');
        // Restore original name on error
        cancelEditGroup(groupId);
    }
};

window.cancelEditGroup = function(groupId) {
    const card = document.querySelector(`.groups-card[data-group-id="${groupId}"]`);
    if (!card) return;
    
    const nameDisplay = card.querySelector('.groups-card-name-display');
    const nameEdit = card.querySelector('.groups-card-name-edit');
    const editBtn = card.querySelector('.groups-action-edit');
    const saveBtn = card.querySelector('.groups-action-save');
    const cancelBtn = card.querySelector('.groups-action-cancel');
    const removeBtn = card.querySelector('.groups-action-remove');
    const editInput = card.querySelector('.groups-card-input');
    
    if (nameDisplay && nameEdit && editBtn && saveBtn && cancelBtn && removeBtn && editInput) {
        // Remove editing class
        card.classList.remove('groups-card-editing', 'groups-card-saving', 'groups-card-saved');
        
        // Restore original name from display
        const originalName = nameDisplay.textContent.trim();
        editInput.value = originalName;
        
        // Re-enable inputs if they were disabled
        editInput.disabled = false;
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        
        // Restore save button content if it was in loading state
        if (saveBtn.querySelector('.fa-spin')) {
            saveBtn.innerHTML = '<i class="fas fa-check"></i><span>Save</span>';
        }
        
        // Smooth transition
        nameEdit.style.opacity = '0';
        setTimeout(() => {
            nameEdit.style.display = 'none';
            nameDisplay.style.display = 'block';
            nameDisplay.style.opacity = '0';
            setTimeout(() => {
                nameDisplay.style.opacity = '1';
            }, 10);
        }, 150);
        
        editBtn.style.display = 'flex';
        saveBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        removeBtn.style.display = 'flex';
    }
};

// Make functions globally available
window.confirmGroup = confirmGroup;
window.rejectGroup = rejectGroup;
window.stopPendingConfirmationsPolling = stopPendingConfirmationsPolling;

