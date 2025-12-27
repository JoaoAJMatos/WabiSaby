const axios = require('axios');
const { logger } = require('../../utils/logger.util');
const config = require('../../config');

/**
 * Spotify Authentication Service
 * Centralized service for managing Spotify API authentication
 */
class SpotifyAuthService {
    constructor() {
        // Cache for Spotify access token
        this.spotifyAccessToken = null;
        this.spotifyTokenExpiry = null;
    }

    /**
     * Check if Spotify API credentials are configured
     * @returns {boolean}
     */
    hasSpotifyCredentials() {
        const clientId = config.spotify?.clientId || process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = config.spotify?.clientSecret || process.env.SPOTIFY_CLIENT_SECRET;
        return !!(clientId && clientSecret);
    }

    /**
     * Get Spotify access token using client credentials flow
     * @returns {Promise<string>} Access token
     */
    async getSpotifyAccessToken() {
        // Return cached token if still valid
        if (this.spotifyAccessToken && this.spotifyTokenExpiry && Date.now() < this.spotifyTokenExpiry) {
            return this.spotifyAccessToken;
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

            this.spotifyAccessToken = response.data.access_token;
            this.spotifyTokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // Refresh 1 min before expiry

            logger.info('[Spotify Auth] Successfully obtained Spotify access token');
            return this.spotifyAccessToken;
        } catch (error) {
            logger.error('[Spotify Auth] Failed to get Spotify access token:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with Spotify API. Please check your credentials.');
        }
    }

    /**
     * Clear cached token (useful when token becomes invalid)
     */
    clearToken() {
        this.spotifyAccessToken = null;
        this.spotifyTokenExpiry = null;
    }
}

// Export singleton instance
const spotifyAuthService = new SpotifyAuthService();

// Backward compatibility - export methods directly
module.exports = {
    getSpotifyAccessToken: spotifyAuthService.getSpotifyAccessToken.bind(spotifyAuthService),
    hasSpotifyCredentials: spotifyAuthService.hasSpotifyCredentials.bind(spotifyAuthService),
    clearToken: spotifyAuthService.clearToken.bind(spotifyAuthService)
};

