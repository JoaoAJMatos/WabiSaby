const { CacheManager } = require('../../utils/cache.util');

/**
 * YouTube Cache Service
 * Consolidates all YouTube-related caches to eliminate circular dependencies
 */
class YouTubeCacheService {
    constructor() {
        // Search cache: 5 minutes TTL, 100 entries max (for general search results)
        this.searchCache = new CacheManager({
            ttl: 5 * 60 * 1000,
            maxSize: 100
        });

        // API search cache: 10 minutes TTL, 100 entries max (for YouTube Data API results)
        this.apiSearchCache = new CacheManager({
            ttl: 10 * 60 * 1000,
            maxSize: 100
        });

        // Validation cache: No expiration, 200 entries max (for URL validation)
        this.validationCache = new CacheManager({
            ttl: Infinity,
            maxSize: 200
        });

        // Video info cache: 10 minutes TTL, 100 entries max (for video metadata)
        this.videoInfoCache = new CacheManager({
            ttl: 10 * 60 * 1000,
            maxSize: 100
        });
    }

    // Search cache methods
    getSearch(query) {
        return this.searchCache.get(query);
    }

    setSearch(query, results) {
        this.searchCache.set(query, results);
    }

    clearSearch() {
        this.searchCache.clear();
    }

    // API search cache methods
    getApiSearch(query) {
        return this.apiSearchCache.get(query);
    }

    setApiSearch(query, results) {
        this.apiSearchCache.set(query, results);
    }

    clearApiSearch() {
        this.apiSearchCache.clear();
    }

    // Validation cache methods
    getValidation(url) {
        return this.validationCache.get(url);
    }

    setValidation(url, type) {
        this.validationCache.set(url, type);
    }

    clearValidation() {
        this.validationCache.clear();
    }

    // Video info cache methods
    getVideoInfo(url) {
        return this.videoInfoCache.get(url);
    }

    setVideoInfo(url, info) {
        this.videoInfoCache.set(url, info);
    }

    clearVideoInfo() {
        this.videoInfoCache.clear();
    }

    // Global methods
    clearAll() {
        this.searchCache.clear();
        this.apiSearchCache.clear();
        this.validationCache.clear();
        this.videoInfoCache.clear();
    }

    // Get cache stats for debugging
    getStats() {
        return {
            searchCache: {
                size: this.searchCache.size,
                maxSize: this.searchCache.maxSize
            },
            apiSearchCache: {
                size: this.apiSearchCache.size,
                maxSize: this.apiSearchCache.maxSize
            },
            validationCache: {
                size: this.validationCache.size,
                maxSize: this.validationCache.maxSize
            },
            videoInfoCache: {
                size: this.videoInfoCache.size,
                maxSize: this.videoInfoCache.maxSize
            }
        };
    }
}

// Export singleton instance
module.exports = new YouTubeCacheService();
