/**
 * VIP Management Module
 * Handles VIP unlock/lock, priority users, and group members management
 */

// VIP Area State
let isVipUnlocked = false;
let vipInactivityTimer = null;

// Store group members data globally for filtering
let allGroupMembers = [];
let currentVipIds = [];

// Initialize VIP area based on stored unlock state
function initializeVipArea() {
    const storedUnlock = sessionStorage.getItem(VIP_UNLOCK_KEY);
    if (storedUnlock === 'true') {
        unlockVipAreaUI();
    }
}

// Handle VIP password unlock form submission
function unlockVipArea(event) {
    event.preventDefault();
    
    const passwordInput = document.getElementById('vip-password');
    const errorEl = document.getElementById('vip-password-error');
    const password = passwordInput.value;
    
    if (password === VIP_ADMIN_PASSWORD) {
        // Correct password
        sessionStorage.setItem(VIP_UNLOCK_KEY, 'true');
        unlockVipAreaUI();
        
        // Clear the password field
        passwordInput.value = '';
        errorEl.textContent = '';
    } else {
        // Incorrect password
        errorEl.textContent = 'Incorrect password. Please try again.';
        passwordInput.classList.add('shake');
        setTimeout(() => passwordInput.classList.remove('shake'), 500);
        passwordInput.value = '';
        passwordInput.focus();
    }
}

// Unlock the VIP area UI
function unlockVipAreaUI() {
    isVipUnlocked = true;
    
    const vipSection = document.getElementById('settings');
    const overlay = document.getElementById('vip-unlock-overlay');
    const contentWrapper = document.getElementById('vip-content-wrapper');
    const lockIndicator = document.getElementById('vip-lock-indicator');
    
    if (vipSection) vipSection.classList.add('unlocked');
    if (overlay) overlay.classList.add('hidden');
    if (contentWrapper) contentWrapper.classList.add('unlocked');
    if (lockIndicator) {
        lockIndicator.classList.add('unlocked');
        lockIndicator.innerHTML = '<i class="fas fa-unlock"></i><span>Unlocked</span>';
    }
    
    // Start inactivity timer
    startVipInactivityTimer();
    
    // Now fetch VIP data
    fetchPriorityUsers();
    fetchGroupMembers();
}

// Lock the VIP area (can be called to re-lock)
function lockVipArea() {
    isVipUnlocked = false;
    sessionStorage.removeItem(VIP_UNLOCK_KEY);
    
    // Clear inactivity timer
    stopVipInactivityTimer();
    
    const vipSection = document.getElementById('settings');
    const overlay = document.getElementById('vip-unlock-overlay');
    const contentWrapper = document.getElementById('vip-content-wrapper');
    const lockIndicator = document.getElementById('vip-lock-indicator');
    
    if (vipSection) vipSection.classList.remove('unlocked');
    if (overlay) overlay.classList.remove('hidden');
    if (contentWrapper) contentWrapper.classList.remove('unlocked');
    if (lockIndicator) {
        lockIndicator.classList.remove('unlocked');
        lockIndicator.innerHTML = '<i class="fas fa-lock"></i><span>Protected</span>';
    }
}

// VIP Inactivity Timer Functions
function startVipInactivityTimer() {
    stopVipInactivityTimer(); // Clear any existing timer
    
    vipInactivityTimer = setTimeout(() => {
        if (isVipUnlocked) {
            console.log('VIP area locked due to inactivity');
            lockVipArea();
            showNotification('VIP area locked due to inactivity', 'info');
        }
    }, VIP_INACTIVITY_TIMEOUT);
}

function stopVipInactivityTimer() {
    if (vipInactivityTimer) {
        clearTimeout(vipInactivityTimer);
        vipInactivityTimer = null;
    }
}

function resetVipInactivityTimer() {
    if (isVipUnlocked) {
        startVipInactivityTimer();
    }
}

// Setup VIP area activity listeners
function setupVipActivityListeners() {
    const vipSection = document.getElementById('settings');
    if (vipSection) {
        // Reset timer on any interaction within VIP section
        ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(event => {
            vipSection.addEventListener(event, resetVipInactivityTimer, { passive: true });
        });
    }
}

// Initialize VIP activity listeners after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupVipActivityListeners);
} else {
    setupVipActivityListeners();
}

// Toggle password visibility
function toggleVipPasswordVisibility() {
    const passwordInput = document.getElementById('vip-password');
    const eyeIcon = document.getElementById('vip-password-eye');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
    }
}

async function fetchPriorityUsers() {
    try {
        const response = await fetch('/api/priority');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        let users = await response.json();
        
        // Ensure users is an array
        if (!Array.isArray(users)) {
            console.error('Invalid response format from /api/priority:', users);
            users = [];
        }
        
        const list = document.getElementById('vip-list');
        const countBadge = document.getElementById('vip-count-badge');
        if (!list) {
            console.error('VIP list element not found');
            return;
        }
        
        list.innerHTML = '';
        
        // Update count badge
        if (countBadge) {
            countBadge.textContent = users.length;
        }
        
        // Fetch profile pictures for all users in parallel
        const usersWithPictures = await Promise.all(users.map(async (user) => {
            // Handle both old format (string) and new format (object with id and name)
            const userId = typeof user === 'string' ? user : (user?.id || null);
            const userName = typeof user === 'object' && user ? user.name : null;
            
            // Skip if userId is invalid
            if (!userId) {
                console.warn('Skipping invalid user:', user);
                return null;
            }
            
            // Fetch profile picture
            let profilePicUrl = null;
            try {
                const picResponse = await fetch(`/api/priority/profile-picture/${encodeURIComponent(userId)}`);
                if (picResponse.ok) {
                    const picData = await picResponse.json();
                    profilePicUrl = picData.url;
                }
            } catch (error) {
                console.error('Error fetching profile picture for', userId, error);
            }
            
            return { userId, userName, profilePicUrl };
        }));
        
        // Filter out null entries
        const validUsers = usersWithPictures.filter(u => u !== null);
        
        // Create VIP cards with new design
        validUsers.forEach(({ userId, userName, profilePicUrl }) => {
            if (!userId) return; // Safety check
            
            const card = document.createElement('li');
            card.className = 'vip-user-card';
            
            // Create avatar element
            const avatarHtml = profilePicUrl 
                ? `<img src="${profilePicUrl}" alt="${userName || 'VIP'}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>';">`
                : '<i class="fas fa-user"></i>';
            
            // Create display text
            const displayName = userName || 'VIP User';
            const displayId = userId && userId.length > 20 ? userId.substring(0, 20) + '...' : (userId || 'Unknown');
            
            card.innerHTML = `
                <div class="vip-user-avatar">
                    ${avatarHtml}
                </div>
                <div class="vip-user-info">
                    <div class="vip-user-name">${displayName}</div>
                    <div class="vip-user-id">${displayId}</div>
                </div>
                <button class="vip-user-remove" onclick="removeVip('${userId}')" title="Remove VIP">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            list.appendChild(card);
        });
        
        // Show empty state if no VIPs
        if (usersWithPictures.length === 0) {
            list.innerHTML = `
                <div class="vip-empty-state">
                    <i class="fas fa-crown"></i>
                    <p>No VIP users yet</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error fetching priority users:', error);
    }
}

async function addVip(e) {
    e.preventDefault();
    const input = document.getElementById('vip-id');
    const id = input.value;
    
    if(!id) return;

    try {
        await fetch('/api/priority/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        input.value = '';
        fetchPriorityUsers();
        showNotification('VIP ADDED', 'success');
    } catch (error) {
        showNotification('ERROR ADDING VIP', 'error');
    }
}

// Add VIP from group member selection
async function addVipFromMember(userId, userName) {
    try {
        await fetch('/api/priority/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: userId, name: userName })
        });
        fetchPriorityUsers();
        fetchGroupMembers(); // Refresh to update the checkmarks
        showNotification(`${userName || 'User'} added as VIP`, 'success');
    } catch (error) {
        showNotification('ERROR ADDING VIP', 'error');
    }
}

window.removeVip = async function(id) {
    const displayId = id.length > 20 ? id.substring(0, 20) + '...' : id;
    const removeTitle = window.i18n?.tSync('ui.dashboard.vip.removeVip') || 'Remove VIP';
    const removeMessage = window.i18n?.tSync('ui.dashboard.vip.removeVipMessage', { displayId }) || `Are you sure you want to remove ${displayId} from VIP?`;
    showConfirmationModal({
        title: removeTitle,
        message: removeMessage,
        icon: 'fa-user-times',
        onConfirm: async () => {
            try {
                await fetch('/api/priority/remove', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                fetchPriorityUsers();
                fetchGroupMembers(); // Refresh to update the checkmarks
                showNotification('VIP REMOVED', 'success');
            } catch (error) {
                showNotification('ERROR REMOVING VIP', 'error');
            }
        }
    });
};

// Fetch group members
async function fetchGroupMembers() {
    try {
        const response = await fetch('/api/priority/group-members');
        const data = await response.json();
        
        if (data.error) {
            const membersList = document.getElementById('members-list');
            membersList.innerHTML = `
                <div class="vip-empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>${data.message || data.error}</p>
                </div>
            `;
            return;
        }
        
        allGroupMembers = data.participants || [];
        
        // Get current VIP IDs
        const vipResponse = await fetch('/api/priority');
        let vipUsers = await vipResponse.json();
        if (!Array.isArray(vipUsers)) {
            vipUsers = [];
        }
        currentVipIds = vipUsers.map(u => typeof u === 'string' ? u : (u?.id || null)).filter(id => id !== null);
        
        displayMembers(allGroupMembers);
    } catch (error) {
        console.error('Error fetching group members:', error);
        const membersList = document.getElementById('members-list');
        membersList.innerHTML = `
            <div class="vip-empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load members</p>
            </div>
        `;
    }
}

// Display members in the list
function displayMembers(members) {
    const membersList = document.getElementById('members-list');
    
    if (members.length === 0) {
        membersList.innerHTML = `
            <div class="vip-empty-state">
                <i class="fas fa-users-slash"></i>
                <p>No members found</p>
            </div>
        `;
        return;
    }
    
    membersList.innerHTML = '';
    
    members.forEach(member => {
        const isVip = currentVipIds.includes(member.id);
        const memberCard = document.createElement('div');
        memberCard.className = `vip-member-item ${isVip ? 'is-vip' : ''}`;
        
        const avatarHtml = member.profilePicUrl 
            ? `<img src="${member.profilePicUrl}" alt="${member.name || 'Member'}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>';">`
            : '<i class="fas fa-user"></i>';
        
        const displayName = member.name || 'Unknown User';
        const escapedName = displayName.replace(/'/g, "\\'");
        
        // Generate group badge HTML
        let groupBadgeHtml = '';
        if (member.groups && member.groups.length > 0) {
            let badgeText = '';
            if (member.groups.length === 1) {
                badgeText = member.groups[0];
            } else {
                // Show count or list (truncate if too long)
                const groupsList = member.groups.join(', ');
                if (groupsList.length > 30) {
                    badgeText = `${member.groups.length} groups`;
                } else {
                    badgeText = groupsList;
                }
            }
            // Escape HTML to prevent XSS
            const escapedBadgeText = badgeText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            groupBadgeHtml = `<div class="vip-member-group-badge">${escapedBadgeText}</div>`;
        }
        
        memberCard.innerHTML = `
            <div class="vip-member-avatar">
                ${avatarHtml}
            </div>
            <div class="vip-member-info">
                <div class="vip-member-name">${displayName}</div>
                ${groupBadgeHtml}
            </div>
            <button class="vip-member-add-btn ${isVip ? 'added' : ''}" 
                    onclick="addVipFromMember('${member.id}', '${escapedName}')"
                    ${isVip ? 'disabled' : ''}
                    title="${isVip ? 'Already VIP' : 'Add as VIP'}">
                <i class="fas ${isVip ? 'fa-check' : 'fa-plus'}"></i>
            </button>
        `;
        
        membersList.appendChild(memberCard);
    });
}

// Filter members based on search input
function filterMembers() {
    const searchTerm = document.getElementById('member-search').value.toLowerCase();
    
    if (!searchTerm) {
        displayMembers(allGroupMembers);
        return;
    }
    
    const filtered = allGroupMembers.filter(member => {
        const nameMatch = member.name && member.name.toLowerCase().includes(searchTerm);
        const idMatch = member.id.toLowerCase().includes(searchTerm);
        return nameMatch || idMatch;
    });
    
    displayMembers(filtered);
}

// Toggle between group selector and manual input
function showGroupSelector() {
    document.getElementById('group-selector-container').classList.remove('hidden');
    document.getElementById('add-vip-form').classList.add('hidden');
    document.getElementById('toggle-group-select').classList.add('active');
    document.getElementById('toggle-manual-input').classList.remove('active');
}

function showManualInput() {
    document.getElementById('group-selector-container').classList.add('hidden');
    document.getElementById('add-vip-form').classList.remove('hidden');
    document.getElementById('toggle-group-select').classList.remove('active');
    document.getElementById('toggle-manual-input').classList.add('active');
}

// Make functions globally available
window.filterMembers = filterMembers;
window.showGroupSelector = showGroupSelector;
window.showManualInput = showManualInput;
window.addVipFromMember = addVipFromMember;
window.unlockVipArea = unlockVipArea;
window.toggleVipPasswordVisibility = toggleVipPasswordVisibility;
window.fetchGroupMembers = fetchGroupMembers;

