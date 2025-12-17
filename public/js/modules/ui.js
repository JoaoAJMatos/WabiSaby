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
    const authSection = document.getElementById('auth-section');
    const qrContainer = document.getElementById('qr-container');
    const statusBadge = document.getElementById('connection-status');
    
    // Get all dashboard sections to hide/show
    const nowPlaying = document.getElementById('now-playing');
    const queue = document.getElementById('queue');
    const effectsCard = document.getElementById('effects-card');
    const stats = document.getElementById('stats');
    const settings = document.getElementById('settings');

    if (authData.isConnected) {
        statusBadge.className = 'status-badge online';
        statusBadge.innerHTML = '<span class="dot"></span> SYSTEM ONLINE';
        authSection.classList.add('hidden');
        
        // Show all dashboard sections
        if (nowPlaying) nowPlaying.classList.remove('hidden');
        if (queue) queue.classList.remove('hidden');
        if (effectsCard) effectsCard.classList.remove('hidden');
        if (stats) stats.classList.remove('hidden');
        if (settings) settings.classList.remove('hidden');
    } else {
        statusBadge.className = 'status-badge offline';
        statusBadge.innerHTML = '<span class="dot"></span> SYSTEM OFFLINE';
        authSection.classList.remove('hidden');
        
        // Hide all dashboard sections
        if (nowPlaying) nowPlaying.classList.add('hidden');
        if (queue) queue.classList.add('hidden');
        if (effectsCard) effectsCard.classList.add('hidden');
        if (stats) stats.classList.add('hidden');
        if (settings) settings.classList.add('hidden');
    }

    // Update header text and QR code
    const headerDescription = document.querySelector('.auth-header-text p');
    
    if (!authData.isConnected && authData.qr) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: authData.qr,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        if (headerDescription) {
            headerDescription.textContent = 'Scan the QR code with your phone to link your WhatsApp account';
        }
    } else if (!authData.isConnected && !authData.qr) {
        qrContainer.innerHTML = '<div class="qr-placeholder"><i class="fas fa-circle-notch fa-spin"></i><span>Waiting for QR...</span></div>';
        if (headerDescription) {
            headerDescription.textContent = 'Generating QR code... Please wait a moment';
        }
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

