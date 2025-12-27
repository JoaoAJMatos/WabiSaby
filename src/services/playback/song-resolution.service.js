const metadataService = require('../metadata/metadata.service');
const youtubeSearchService = require('../youtube/search.service');
const { isSpotifyUrl, isYouTubeUrl } = require('../../utils/url.util');
const { logger } = require('../../utils/logger.util');

/**
 * Song Resolution Service
 *
 * Handles URL resolution and search logic:
 * - Resolve URLs (Spotify, YouTube) to metadata
 * - Handle search queries
 * - Return standardized song objects
 */
class SongResolutionService {
    constructor() {}

    /**
     * Resolve song input to standardized song object
     * @param {string} input - URL or search query
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Resolved song object
     */
    async resolveSong(input, options = {}) {
        if (!input) {
            throw new Error('Input is required');
        }

        let url = input;
        let title = '';
        let artist = '';

        // Check if input is a URL
        if (isSpotifyUrl(input) || isYouTubeUrl(input)) {
            // Resolve info from URL
            const info = await metadataService.getTrackInfo(input);
            title = info.title;
            artist = info.artist;
            // Warn if we got a fallback title
            if (title.includes('Unknown Track') || title.includes('YouTube Video')) {
                logger.warn(`[SongResolution] Got fallback title for ${input}: ${title}`);
            }
        } else {
            // Treat as search query
            logger.info(`[SongResolution] Searching for: ${input}`);
            const searchResult = await youtubeSearchService.searchYouTube(input);
            url = searchResult.url;
            title = searchResult.title;
            artist = searchResult.artist;
            logger.info(`[SongResolution] Found: ${title} by ${artist} at ${url}`);
        }

        return {
            type: 'url',
            content: url,
            title: title,
            artist: artist,
            requester: options.requester || 'Web User',
            remoteJid: options.remoteJid || 'WEB_DASHBOARD',
            sender: options.sender || 'WEB_DASHBOARD'
        };
    }

    /**
     * Resolve URL to metadata
     * @param {string} url - URL to resolve
     * @returns {Promise<Object>} Metadata object
     */
    async resolveUrl(url) {
        if (!isSpotifyUrl(url) && !isYouTubeUrl(url)) {
            throw new Error('Invalid URL format');
        }

        const info = await metadataService.getTrackInfo(url);
        return {
            url: url,
            title: info.title,
            artist: info.artist
        };
    }

    /**
     * Search for song by query
     * @param {string} query - Search query
     * @returns {Promise<Object>} Search result
     */
    async searchQuery(query) {
        logger.info(`[SongResolution] Searching for: ${query}`);
        const searchResult = await youtubeSearchService.searchYouTube(query);
        logger.info(`[SongResolution] Found: ${searchResult.title} by ${searchResult.artist} at ${searchResult.url}`);

        return {
            type: 'url',
            content: searchResult.url,
            title: searchResult.title,
            artist: searchResult.artist
        };
    }
}

module.exports = new SongResolutionService();
