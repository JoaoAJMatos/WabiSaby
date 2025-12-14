/**
 * Generic Cache Utility
 * Provides a reusable cache manager with TTL and size limits
 */

class CacheManager {
    /**
     * Create a new cache manager
     * @param {Object} options - Cache options
     * @param {number} options.ttl - Time to live in milliseconds (default: 5 minutes)
     * @param {number} options.maxSize - Maximum number of entries (default: 100)
     */
    constructor(options = {}) {
        this.cache = new Map();
        this.ttl = options.ttl || 5 * 60 * 1000; // Default 5 minutes
        this.maxSize = options.maxSize || 100;
    }

    /**
     * Get cached value or null if expired/missing
     * @param {string} key - Cache key
     * @returns {*} Cached value or null
     */
    get(key) {
        const cached = this.cache.get(key);
        if (!cached) {
            return null;
        }

        // Check if expired
        if (Date.now() - cached.timestamp >= this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    /**
     * Set a value in the cache
     * @param {string} key - Cache key
     * @param {*} data - Data to cache
     */
    set(key, data) {
        // Remove oldest entry if at max size
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Check if a key exists and is not expired
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        const cached = this.cache.get(key);
        if (!cached) {
            return false;
        }

        // Check if expired
        if (Date.now() - cached.timestamp >= this.ttl) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Delete a key from cache
     * @param {string} key - Cache key
     * @returns {boolean} True if key was deleted
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * Clear all entries from cache
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Get current cache size
     * @returns {number}
     */
    size() {
        return this.cache.size;
    }
}

module.exports = { CacheManager };

