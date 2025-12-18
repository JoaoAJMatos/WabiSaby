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
            // Enhanced onboarding empty state
            container.innerHTML = `
                <div class="groups-empty groups-onboarding-state">
                    <div class="groups-onboarding-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="groups-onboarding-content">
                        <h3>Welcome! Let's set up your first group</h3>
                        <p class="groups-onboarding-description">To start using WabiSaby, you need to add at least one WhatsApp group. The bot will listen to messages from groups you add here.</p>
                        <div class="groups-onboarding-steps">
                            <div class="groups-onboarding-step">
                                <div class="step-number">1</div>
                                <div class="step-content">
                                    <strong>Send <code>!ping</code> in a WhatsApp group</strong>
                                    <p>Open any WhatsApp group and send the command <code>!ping</code>. The request will appear in the "Pending Requests" section above.</p>
                                </div>
                            </div>
                            <div class="groups-onboarding-step">
                                <div class="step-number">2</div>
                                <div class="step-content">
                                    <strong>Confirm the request</strong>
                                    <p>Click the checkmark button to approve the group. It will then appear in your monitored groups list.</p>
                                </div>
                            </div>
                            <div class="groups-onboarding-step">
                                <div class="step-number">3</div>
                                <div class="step-content">
                                    <strong>Or add manually</strong>
                                    <p>You can also manually add a group using the form above by entering its WhatsApp ID (ends with @g.us).</p>
                                </div>
                            </div>
                        </div>
                        <div class="groups-onboarding-cta">
                            <i class="fas fa-arrow-up"></i>
                            <span>Use the form above to get started</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = groups.map(group => {
                const addedDate = group.addedAt ? new Date(group.addedAt).toLocaleDateString() : 'Unknown';
                return `
                    <div class="groups-item" data-group-id="${group.id}">
                        <div class="groups-item-info">
                            <div class="groups-item-name">${escapeHtml(group.name)}</div>
                            <div class="groups-item-id">${escapeHtml(group.id)}</div>
                            <div class="groups-item-date">Added: ${addedDate}</div>
                        </div>
                        <button type="button" class="groups-remove-btn" onclick="removeGroup('${group.id}')" title="Remove group">
                            <i class="fas fa-trash"></i>
                        </button>
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

// Make functions globally available
window.confirmGroup = confirmGroup;
window.rejectGroup = rejectGroup;
window.stopPendingConfirmationsPolling = stopPendingConfirmationsPolling;

