/**
 * Auth Page Logic
 * Handles QR code display and authentication status polling
 */

let qrCodeInstance = null;
let authPollInterval = null;
let consecutiveFalseCount = 0; // Track consecutive false auth statuses

// Show auth page immediately - no loading screen needed
// The page will show "Waiting for QR code" while it's being generated
hideLoadingScreen();

function updateQRCode(qrData) {
    const qrContainer = document.getElementById('qr-container');
    const headerDescription = document.querySelector('.auth-header-text p');
    
    if (!qrContainer) return;
    
    if (qrData) {
        // Clear existing QR code
        qrContainer.innerHTML = '';
        
        // Create new QR code with sophisticated dark tone
        // Using deep charcoal for premium feel and optimal contrast
        qrCodeInstance = new QRCode(qrContainer, {
            text: qrData,
            width: 280,
            height: 280,
            colorDark: "#1e1e28", // Deep charcoal - sophisticated, premium, excellent contrast
            colorLight: "#ffffff", // White background for optimal scanning
            correctLevel: QRCode.CorrectLevel.H
        });
        
        if (headerDescription) {
            headerDescription.textContent = 'Scan the QR code with your phone to link your WhatsApp account';
        }
    } else {
        qrContainer.innerHTML = '<div class="qr-placeholder"><i class="fas fa-circle-notch fa-spin"></i><span>Waiting for QR...</span></div>';
        qrCodeInstance = null;
        if (headerDescription) {
            headerDescription.textContent = 'Generating QR code... Please wait a moment';
        }
    }
}

function updateStatusBadge(isConnected) {
    const statusBadge = document.getElementById('connection-status');
    if (!statusBadge) return;
    
    if (isConnected) {
        statusBadge.className = 'status-badge online';
        statusBadge.innerHTML = '<span class="dot"></span> SYSTEM ONLINE';
    } else {
        statusBadge.className = 'status-badge offline';
        statusBadge.innerHTML = '<span class="dot"></span> SYSTEM OFFLINE';
    }
}

function hideLoadingScreen() {
    // Show auth page immediately - no delay needed
    actuallyHideLoadingScreen();
}

function actuallyHideLoadingScreen() {
    const loadingOverlay = document.getElementById('loading-overlay');
    const mainContainer = document.getElementById('main-container');
    
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
    }
    if (mainContainer) {
        mainContainer.style.display = '';
    }
}

async function fetchAuthStatus() {
    try {
        // Check if we're here because of a logout (don't auto-redirect)
        // Check both URL parameter and sessionStorage flag
        const urlParams = new URLSearchParams(window.location.search);
        const urlLogout = urlParams.get('logout') === 'true';
        const storageLogout = sessionStorage.getItem('logout_flag') === 'true';
        const isLogout = urlLogout || storageLogout;
        
        const response = await fetch('/api/status');
        const data = await response.json();
        
        if (data.auth) {
            const isConnected = data.auth.isConnected;
            
            // If connected (explicitly true), redirect to dashboard immediately
            // UNLESS this is a logout action (user explicitly wants to see auth page)
            if (isConnected === true && !isLogout) {
                // Reset counter on successful connection
                consecutiveFalseCount = 0;
                // Redirect immediately - no loading message needed
                window.location.replace('/pages/dashboard.html');
                return;
            }
            
            // If logout, show auth page even if connected (user wants to disconnect)
            if (isConnected === true && isLogout) {
                // Show auth page content (QR code if available, or connection status)
                updateStatusBadge(true);
                // Clear the logout flag from sessionStorage and URL
                sessionStorage.removeItem('logout_flag');
                if (urlLogout) {
                    window.history.replaceState({}, '', '/pages/auth.html');
                }
                return;
            }
            
            // Determine if we should show auth page:
            // 1. If QR code is present, we're definitely not authenticated - show immediately
            // 2. If no QR code but isConnected is false, show page immediately (don't wait)
            //    The page will show "Waiting for QR code" while it's being generated
            const hasQRCode = !!data.auth.qr;
            let shouldShowAuthPage = false;
            
            if (hasQRCode) {
                // QR code present = definitive not authenticated, show auth page immediately
                shouldShowAuthPage = true;
                consecutiveFalseCount = 0; // Reset counter since we have definitive status
            } else if (isConnected === false) {
                // Not connected - show auth page immediately (don't wait for multiple checks)
                // This ensures fast display after logout
                shouldShowAuthPage = true;
                consecutiveFalseCount = 0;
            } else {
                // Reset counter if isConnected is not explicitly false
                consecutiveFalseCount = 0;
            }
            
            if (shouldShowAuthPage) {
                // Not connected - show auth page content immediately
                hideLoadingScreen();
                
                // Update status badge
                updateStatusBadge(false);
                
                // Update QR code if available, otherwise show placeholder
                if (data.auth.qr) {
                    updateQRCode(data.auth.qr);
                } else {
                    updateQRCode(null);
                }
            } else {
                // Still initializing - update status badge but don't show page yet
                updateStatusBadge(isConnected === true);
            }
        } else {    
            // No auth data - show auth page anyway
            hideLoadingScreen();
        }
    } catch (error) {
        console.error('Error fetching auth status:', error);
        // On error, show auth page
        hideLoadingScreen();
    }
}

// Initial fetch
fetchAuthStatus();

// Poll for auth status every 2 seconds
authPollInterval = setInterval(fetchAuthStatus, 2000);

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (authPollInterval) {
        clearInterval(authPollInterval);
    }
});

