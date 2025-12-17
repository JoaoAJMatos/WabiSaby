/**
 * Device Fingerprinting Utility
 * Generates a unique device identifier using browser characteristics
 */

const FINGERPRINT_STORAGE_KEY = 'wabisaby_device_fingerprint';

/**
 * Generate canvas fingerprint
 * @returns {string} Canvas fingerprint hash
 */
function getCanvasFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 200;
        canvas.height = 50;
        
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('WabiSaby', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('WabiSaby', 4, 17);
        
        return canvas.toDataURL();
    } catch (e) {
        return 'canvas_error';
    }
}

/**
 * Generate WebGL fingerprint
 * @returns {string} WebGL fingerprint
 */
function getWebGLFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (!gl) {
            return 'webgl_not_supported';
        }
        
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown';
        }
        
        return gl.getParameter(gl.VERSION) || 'unknown';
    } catch (e) {
        return 'webgl_error';
    }
}

/**
 * Simple hash function (fallback when crypto.subtle is not available)
 * @param {string} str - String to hash
 * @returns {string} Hash hex string
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to positive hex string
    const hashStr = Math.abs(hash).toString(16);
    // Pad to ensure consistent length (8 chars)
    return hashStr.padStart(8, '0');
}

/**
 * Generate SHA-256 hash using Web Crypto API (requires secure context)
 * @param {string} str - String to hash
 * @returns {Promise<string>} Hash hex string
 */
async function sha256Hash(str) {
    try {
        // Check if crypto.subtle is available (requires HTTPS)
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            const encoder = new TextEncoder();
            const data = encoder.encode(str);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
    } catch (error) {
        // Fall through to simple hash
    }
    
    // Fallback: use simple hash function
    // Combine multiple simple hashes for better distribution
    const parts = [];
    for (let i = 0; i < str.length; i += 100) {
        parts.push(simpleHash(str.substring(i, i + 100)));
    }
    return parts.join('').substring(0, 64); // Return 64-char hex string (like SHA-256)
}

/**
 * Generate device fingerprint
 * Combines multiple browser characteristics to create a unique identifier
 * @returns {Promise<string>} Hash of the fingerprint
 */
async function generateDeviceFingerprint() {
    // Check localStorage first
    const stored = localStorage.getItem(FINGERPRINT_STORAGE_KEY);
    if (stored) {
        return stored;
    }
    
    // Collect fingerprint data
    const fingerprintData = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: navigator.languages ? navigator.languages.join(',') : '',
        platform: navigator.platform,
        screenWidth: screen.width,
        screenHeight: screen.height,
        colorDepth: screen.colorDepth,
        pixelRatio: window.devicePixelRatio || 1,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        canvas: getCanvasFingerprint(),
        webgl: getWebGLFingerprint(),
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack || 'unknown'
    };
    
    // Create a string from all values
    const fingerprintString = JSON.stringify(fingerprintData);
    
    // Generate hash (SHA-256 if available, otherwise fallback)
    const hashHex = await sha256Hash(fingerprintString);
    
    // Store in localStorage for future use
    localStorage.setItem(FINGERPRINT_STORAGE_KEY, hashHex);
    
    return hashHex;
}

/**
 * Get stored device fingerprint
 * @returns {string|null} Stored fingerprint or null
 */
function getStoredFingerprint() {
    return localStorage.getItem(FINGERPRINT_STORAGE_KEY);
}

/**
 * Clear stored fingerprint (for testing/debugging)
 */
function clearFingerprint() {
    localStorage.removeItem(FINGERPRINT_STORAGE_KEY);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateDeviceFingerprint,
        getStoredFingerprint,
        clearFingerprint
    };
}

