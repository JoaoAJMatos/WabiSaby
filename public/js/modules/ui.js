/**
 * UI Update Functions
 * Handles all UI updates for auth, queue, stats, and background images
 */

// Background Image Management
let backgroundImageUrl = null;

function updateBackgroundImage(url) {
    if (backgroundImageUrl === url) return; // Avoid duplicate updates

    backgroundImageUrl = url;
    const overlay = document.querySelector('.bg-overlay');
    if (!overlay) return;

    // Add new background with fade effect
    const img = new Image();
    img.onload = () => {
        overlay.style.backgroundImage = `url(${url})`;
        overlay.style.opacity = '1';
    };
    img.src = url;
}

function clearBackgroundImage() {
    backgroundImageUrl = null;
    const overlay = document.querySelector('.bg-overlay');
    if (!overlay) return;

    overlay.style.opacity = '0';
    setTimeout(() => {
        if (!backgroundImageUrl) {
            overlay.style.backgroundImage = '';
        }
    }, 800); // Wait for transition
}

function updateAuthUI(authData) {
    // Only update status badge (auth section is on separate page now)
    const statusBadge = document.getElementById('connection-status');
    
    if (!statusBadge) return;
    
    if (authData.isConnected) {
        statusBadge.className = 'status-badge online';
        statusBadge.innerHTML = '<span class="dot"></span> SYSTEM ONLINE';
    } else {
        statusBadge.className = 'status-badge offline';
        statusBadge.innerHTML = '<span class="dot"></span> SYSTEM OFFLINE';
    }
}

function updateStatsUI(stats) {
    if (!stats) return;

    // Store stats and timestamp for local interpolation
    // Note: serverStats and statsReceivedAt should be managed in dashboard.js
    // This function will be called with the stats object
    // The actual update happens in updateProgressBarAndStats()
}

// Note: updateQueueUI and updateProgressBarAndStats are large functions
// that will be kept in dashboard.js for now as they have many dependencies
// and complex state management. They can be refactored later if needed.

