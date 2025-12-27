/**
 * URL Utility
 * Centralized URL validation functions for Spotify, YouTube, and playlists
 */

/**
 * Check if URL is a Spotify URL
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isSpotifyUrl(url) {
    return url.includes('spotify.com');
}

/**
 * Check if URL is a YouTube URL
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isYouTubeUrl(url) {
    return url.includes('youtube.com') || url.includes('youtu.be');
}

/**
 * Check if URL is a Spotify playlist or album
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isSpotifyPlaylist(url) {
    return url.includes('spotify.com/playlist/') || url.includes('spotify.com/album/');
}

/**
 * Check if URL is a YouTube playlist
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isYouTubePlaylist(url) {
    return (url.includes('youtube.com') || url.includes('youtu.be')) && url.includes('list=');
}

/**
 * Check if URL is any playlist (Spotify or YouTube)
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isPlaylistUrl(url) {
    return isSpotifyPlaylist(url) || isYouTubePlaylist(url);
}

/**
 * Check if URL is a Spotify track URL (not album/playlist)
 * @param {string} url - Spotify URL
 * @returns {boolean}
 */
function isSpotifyTrackUrl(url) {
    return /track\/([a-zA-Z0-9]+)/.test(url);
}

/**
 * Check if string is a file path (not a URL)
 * @param {string} pathOrUrl - Path or URL to check
 * @returns {boolean}
 */
function isFilePath(pathOrUrl) {
    if (!pathOrUrl || typeof pathOrUrl !== 'string') return false;
    // Check if it looks like a file path (starts with / or C:\ or contains backslashes on Windows)
    // and is not a URL (doesn't start with http:// or https://)
    const isUrl = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://');
    if (isUrl) return false;
    
    // Check for common path patterns
    const path = require('path');
    // Absolute paths on Windows (C:\, D:\, etc.) or Unix (/)
    if (path.isAbsolute(pathOrUrl)) return true;
    // Paths with backslashes (Windows) or forward slashes (Unix) that aren't URLs
    if (pathOrUrl.includes(path.sep) || pathOrUrl.includes('/') || pathOrUrl.includes('\\')) {
        // But exclude things that look like URLs without protocol
        if (pathOrUrl.includes('://')) return false;
        // If it has a file extension and path separators, it's likely a file path
        if (path.extname(pathOrUrl)) return true;
    }
    return false;
}

module.exports = {
    isSpotifyUrl,
    isYouTubeUrl,
    isSpotifyPlaylist,
    isYouTubePlaylist,
    isPlaylistUrl,
    isSpotifyTrackUrl,
    isFilePath
};

