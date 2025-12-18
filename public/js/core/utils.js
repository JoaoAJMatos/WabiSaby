/**
 * Utility Functions
 * Pure helper functions used throughout the application
 */

// Format time from milliseconds to MM:SS
function formatTime(ms) {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Format uptime
function formatUptime(ms) {
    if (!ms || ms < 0) return '0h 0m';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Get time ago string
function getTimeAgo(timestamp) {
    // Validate timestamp
    if (!timestamp || isNaN(timestamp) || timestamp <= 0) {
        return 'Unknown';
    }
    
    // Check if timestamp is in seconds instead of milliseconds (fallback for edge cases)
    // Valid millisecond timestamps are typically > 1e12 (dates after 2001)
    if (timestamp < 1e10) {
        timestamp = timestamp * 1000;
    }
    
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);
    
    // Handle invalid timestamps:
    // - Negative means timestamp is in the future (likely corrupted data)
    // - Timestamp way in the future (more than 1 year ahead) indicates corruption
    // Note: We allow very old timestamps (seconds > 31536000) to display normally
    if (seconds < 0 || timestamp > now + 31536000000) {
        return 'Unknown';
    }
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// Linear interpolation helper
function lerp(current, target, speed) {
    return current + (target - current) * speed;
}

