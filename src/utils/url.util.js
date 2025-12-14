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

module.exports = {
    isSpotifyUrl,
    isYouTubeUrl,
    isSpotifyPlaylist,
    isYouTubePlaylist,
    isPlaylistUrl,
    isSpotifyTrackUrl
};

