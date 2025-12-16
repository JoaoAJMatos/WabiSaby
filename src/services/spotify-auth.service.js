const axios = require('axios');
const { logger } = require('../utils/logger.util');
const config = require('../config');

/**
 * Spotify Authentication Service
 * Centralized service for managing Spotify API authentication
 */

// Cache for Spotify access token
let spotifyAccessToken = null;
let spotifyTokenExpiry = null;

/**
 * Check if Spotify API credentials are configured
 * @returns {boolean}
 */
function hasSpotifyCredentials() {
    const clientId = config.spotify?.clientId || process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = config.spotify?.clientSecret || process.env.SPOTIFY_CLIENT_SECRET;
    return !!(clientId && clientSecret);
}

/**
 * Get Spotify access token using client credentials flow
 * @returns {Promise<string>} Access token
 */
async function getSpotifyAccessToken() {
    // Return cached token if still valid
    if (spotifyAccessToken && spotifyTokenExpiry && Date.now() < spotifyTokenExpiry) {
        return spotifyAccessToken;
    }

    const clientId = config.spotify?.clientId || process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = config.spotify?.clientSecret || process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Spotify API credentials not configured. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your .env file.');
    }

    try {
        const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
                }
            }
        );

        spotifyAccessToken = response.data.access_token;
        spotifyTokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // Refresh 1 min before expiry

        logger.info('[Spotify Auth] Successfully obtained Spotify access token');
        return spotifyAccessToken;
    } catch (error) {
        logger.error('[Spotify Auth] Failed to get Spotify access token:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Spotify API. Please check your credentials.');
    }
}

/**
 * Clear cached token (useful when token becomes invalid)
 */
function clearToken() {
    spotifyAccessToken = null;
    spotifyTokenExpiry = null;
}

module.exports = {
    getSpotifyAccessToken,
    hasSpotifyCredentials,
    clearToken
};

