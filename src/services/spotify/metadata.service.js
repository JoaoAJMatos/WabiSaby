const axios = require('axios');
const cheerio = require('cheerio');
const { logger } = require('../../utils/logger.util');
const { getSpotifyAccessToken, hasSpotifyCredentials, clearToken } = require('./auth.service');
const { isSpotifyTrackUrl } = require('../../utils/url.util');

/**
 * Spotify Metadata Service
 * Handles fetching metadata from Spotify URLs and APIs
 */

/**
 * Extract track ID from Spotify URL
 * @param {string} url - Spotify URL
 * @returns {string|null} Track ID or null
 */
function extractSpotifyTrackId(url) {
    const trackMatch = url.match(/track\/([a-zA-Z0-9]+)/);
    return trackMatch ? trackMatch[1] : null;
}

/**
 * Get track metadata from Spotify API
 * @param {string} url - Spotify track URL
 * @returns {Promise<{title: string, artist: string, searchQuery: string, duration: number}>}
 */
async function getSpotifyTrackMetadata(url) {
    const trackId = extractSpotifyTrackId(url);
    if (!trackId) {
        throw new Error('Could not extract Spotify track ID from URL');
    }

    try {
        const token = await getSpotifyAccessToken();
        const response = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const track = response.data;
        const title = track.name;
        const artists = track.artists.map(a => a.name).join(', ');
        const primaryArtist = track.artists[0]?.name || '';
        const duration = Math.floor(track.duration_ms / 1000); // Duration in seconds

        // Construct optimized search query: "Artist - Song" format works best
        const searchQuery = `${primaryArtist} - ${title}`;

        logger.info(`[Spotify API] Track: "${title}" by ${artists} (${duration}s)`);

        return {
            title,
            artist: artists,
            primaryArtist,
            searchQuery,
            duration
        };
    } catch (error) {
        if (error.response?.status === 401) {
            clearToken();
        }
        logger.error(`[Spotify API] Failed to fetch track: ${error.message}`);
        throw error;
    }
}

/**
 * Get Spotify metadata using API (preferred) or web scraping (fallback)
 * @param {string} url - Spotify URL
 * @returns {Promise<{searchQuery: string, title: string, artist: string, duration: number|null}>}
 */
async function getSpotifyMetadata(url) {
    // Validate that this is a track URL, not an album or playlist
    if (!isSpotifyTrackUrl(url)) {
        throw new Error('Only individual Spotify track URLs are supported. Album and playlist URLs are not allowed. Please use the !playlist command for albums/playlists.');
    }

    // Try Spotify API first if credentials are available
    if (hasSpotifyCredentials()) {
        try {
            const metadata = await getSpotifyTrackMetadata(url);
            return {
                searchQuery: metadata.searchQuery,
                title: metadata.title,
                artist: metadata.artist,
                primaryArtist: metadata.primaryArtist,
                duration: metadata.duration
            };
        } catch (apiError) {
            // If the error is about not being able to extract track ID, don't fall back to scraping
            if (apiError.message.includes('Could not extract Spotify track ID')) {
                throw new Error('Only individual Spotify track URLs are supported. Album and playlist URLs are not allowed.');
            }
            logger.warn(`[Spotify] API failed, falling back to web scraping: ${apiError.message}`);
        }
    }

    // Fallback to web scraping (only for track URLs)
    try {
        logger.info('[Spotify] Using web scraping (no API credentials or API failed)');
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const title = $('meta[property="og:title"]').attr('content') || 'Unknown';
        const description = $('meta[property="og:description"]').attr('content') || '';

        // Try to extract artist from description (format: "ARTIST · Song · 2023")
        let artist = '';
        if (description) {
            const parts = description.split('·');
            if (parts.length > 0) {
                artist = parts[0].trim();
            }
        }

        // Construct a better search query
        const searchQuery = artist ? `${artist} - ${title}` : title;

        return {
            searchQuery,
            title,
            artist,
            primaryArtist: artist,
            duration: null
        };
    } catch (error) {
        logger.error('[Spotify] Error scraping:', error);
        throw new Error('Failed to resolve Spotify link');
    }
}

module.exports = {
    extractSpotifyTrackId,
    getSpotifyTrackMetadata,
    getSpotifyMetadata,
    hasSpotifyCredentials
};
