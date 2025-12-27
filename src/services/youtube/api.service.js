const axios = require('axios');
const { logger } = require('../../utils/logger.util');
const config = require('../../config');
const quotaService = require('./quota.service');
const { youtubeCache } = require('../cache');

/**
 * YouTube API Service
 * Handles YouTube Data API v3 interactions
 */

/**
 * Check if YouTube API is configured
 * @returns {boolean} True if API key is configured
 */
function isConfigured() {
    return !!config.youtube.apiKey;
}

/**
 * Parse ISO 8601 duration to seconds
 * @param {string} duration - ISO 8601 duration string (e.g., "PT3M45S")
 * @returns {number} Duration in seconds
 */
function parseDuration(duration) {
    if (!duration) return null;

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;

    const hours = parseInt(match[1] || 0, 10);
    const minutes = parseInt(match[2] || 0, 10);
    const seconds = parseInt(match[3] || 0, 10);

    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Search YouTube using Data API v3
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {string} options.expectedTitle - Expected song title for verification
 * @param {string} options.expectedArtist - Expected artist for verification
 * @param {number} options.expectedDuration - Expected duration in seconds
 * @returns {Promise<Array>} Array of search results with scoring
 */
async function searchYouTubeAPI(query, options = {}) {
    const { expectedTitle = '', expectedArtist = '', expectedDuration = null } = options;

    // Check if API is configured
    if (!isConfigured()) {
        throw new Error('YouTube API key not configured');
    }

    // Check quota
    if (!quotaService.hasQuotaAvailable()) {
        throw new Error('YouTube API quota exceeded');
    }

    // Check cache
    const cached = youtubeCache.getApiSearch(query);
    if (cached) {
        logger.debug(`[YouTube API] Using cached result for: "${query}"`);
        return cached;
    }

    try {
        logger.info(`[YouTube API] Searching for: "${query}"`);

        // Step 1: Search for videos
        const searchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                q: query,
                type: 'video',
                maxResults: 20, // Get more results for better matching
                order: 'relevance',
                key: config.youtube.apiKey
            }
        });

        quotaService.recordQuotaUsage(quotaService.SEARCH_COST);

        if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
            logger.warn(`[YouTube API] No results found for: "${query}"`);
            return [];
        }

        // Step 2: Get detailed video information (duration, channel, etc.)
        const videoIds = searchResponse.data.items.map(item => item.id.videoId).join(',');

        const videoDetailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'snippet,contentDetails,statistics',
                id: videoIds,
                key: config.youtube.apiKey
            }
        });

        quotaService.recordQuotaUsage(quotaService.VIDEO_INFO_COST);

        // Combine search results with video details
        const videoDetailsMap = new Map();
        videoDetailsResponse.data.items.forEach(video => {
            videoDetailsMap.set(video.id, video);
        });

        // Transform results to match play-dl format for compatibility
        const results = searchResponse.data.items
            .map(item => {
                const videoDetails = videoDetailsMap.get(item.id.videoId);
                if (!videoDetails) return null;

                const duration = parseDuration(videoDetails.contentDetails?.duration);
                const viewCount = videoDetails.statistics?.viewCount
                    ? parseInt(videoDetails.statistics.viewCount, 10)
                    : null;

                return {
                    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                    title: item.snippet.title,
                    channel: {
                        name: item.snippet.channelTitle,
                        id: item.snippet.channelId
                    },
                    durationInSec: duration,
                    type: 'video',
                    viewCount: viewCount,
                    // Additional metadata from API
                    publishedAt: item.snippet.publishedAt,
                    description: item.snippet.description,
                    thumbnails: item.snippet.thumbnails
                };
            })
            .filter(result => result !== null);

        // Cache results
        youtubeCache.setApiSearch(query, results);

        logger.info(`[YouTube API] Found ${results.length} results for: "${query}"`);
        return results;

    } catch (error) {
        const errorMsg = error?.response?.data?.error?.message || error?.message || 'Unknown error';

        // Check for quota errors
        if (error.response?.status === 403) {
            const errorData = error.response.data?.error;
            if (errorData?.errors?.[0]?.reason === 'quotaExceeded' ||
                errorData?.message?.includes('quota') ||
                errorMsg.includes('quota')) {
                logger.error('[YouTube API] Quota exceeded');
                throw new Error('YouTube API quota exceeded');
            }
        }

        // Check for invalid API key
        if (error.response?.status === 400 || error.response?.status === 401) {
            logger.error(`[YouTube API] Invalid API key or request: ${errorMsg}`);
            throw new Error(`YouTube API error: ${errorMsg}`);
        }

        logger.error(`[YouTube API] Search failed: ${errorMsg}`);
        throw error;
    }
}

module.exports = {
    searchYouTubeAPI,
    isConfigured,
    parseDuration
};
