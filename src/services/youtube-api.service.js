const axios = require('axios');
const { logger } = require('../utils/logger');
const config = require('../config');
const { CacheManager } = require('../utils/cache.util');

// Quota tracking
let dailyQuotaUsed = 0;
let quotaResetTime = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
const QUOTA_LIMIT = 10000; // Default free quota per day
const SEARCH_COST = 100; // Cost per search.list request
const VIDEO_INFO_COST = 1; // Cost per videos.list request

// Cache for API results
const apiSearchCache = new CacheManager({ ttl: 10 * 60 * 1000, maxSize: 100 }); // 10 minutes TTL, 100 entries max

/**
 * Check if we have quota available
 */
function hasQuotaAvailable() {
    // Reset quota counter if 24 hours have passed
    if (Date.now() >= quotaResetTime) {
        dailyQuotaUsed = 0;
        quotaResetTime = Date.now() + (24 * 60 * 60 * 1000);
        logger.info('[YouTube API] Daily quota reset');
    }
    
    // Check if we have enough quota for a search
    const estimatedCost = SEARCH_COST + (VIDEO_INFO_COST * 15); // Search + ~15 video details
    return (dailyQuotaUsed + estimatedCost) < QUOTA_LIMIT;
}

/**
 * Record quota usage
 */
function recordQuotaUsage(cost) {
    dailyQuotaUsed += cost;
    const remaining = QUOTA_LIMIT - dailyQuotaUsed;
    
    if (remaining < 1000) {
        logger.warn(`[YouTube API] Low quota remaining: ~${remaining} units`);
    } else if (remaining < 5000) {
        logger.info(`[YouTube API] Quota remaining: ~${remaining} units`);
    }
}

/**
 * Check if YouTube API is configured
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
    if (!hasQuotaAvailable()) {
        throw new Error('YouTube API quota exceeded');
    }
    
    // Check cache
    const cached = apiSearchCache.get(query);
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
        
        recordQuotaUsage(SEARCH_COST);
        
        if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
            logger.warn(`[YouTube API] No results found for: "${query}"`);
            return [];
        }
        
        // Step 2: Get detailed video information (duration, channel, etc.)
        const videoIds = searchResponse.data.items.map(item => item.id.videoId).join(',');
        
        const videoDetailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'snippet,contentDetails',
                id: videoIds,
                key: config.youtube.apiKey
            }
        });
        
        recordQuotaUsage(VIDEO_INFO_COST);
        
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
                
                return {
                    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                    title: item.snippet.title,
                    channel: {
                        name: item.snippet.channelTitle,
                        id: item.snippet.channelId
                    },
                    durationInSec: duration,
                    type: 'video',
                    // Additional metadata from API
                    publishedAt: item.snippet.publishedAt,
                    description: item.snippet.description,
                    thumbnails: item.snippet.thumbnails
                };
            })
            .filter(result => result !== null);
        
        // Cache results
        apiSearchCache.set(query, results);
        
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

/**
 * Get quota status
 */
function getQuotaStatus() {
    const remaining = QUOTA_LIMIT - dailyQuotaUsed;
    const resetTime = new Date(quotaResetTime);
    
    return {
        used: dailyQuotaUsed,
        limit: QUOTA_LIMIT,
        remaining: remaining,
        resetTime: resetTime.toISOString()
    };
}

/**
 * Reset quota counter (for testing)
 */
function resetQuota() {
    dailyQuotaUsed = 0;
    quotaResetTime = Date.now() + (24 * 60 * 60 * 1000);
}

module.exports = {
    searchYouTubeAPI,
    isConfigured,
    hasQuotaAvailable,
    getQuotaStatus,
    resetQuota
};

