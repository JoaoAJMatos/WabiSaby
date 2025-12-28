/**
 * Generic Cache Utility
 * Provides a reusable cache manager with TTL and LRU eviction
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
     * Implements LRU: moves accessed item to end of Map
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

        // LRU: Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, cached);

        return cached.data;
    }

    /**
     * Set a value in the cache
     * Implements LRU eviction: removes least recently used item when at capacity
     * @param {string} key - Cache key
     * @param {*} data - Data to cache
     */
    set(key, data) {
        // If key exists, delete it first (will be re-added at end)
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        // Evict least recently used entry if at max size
        else if (this.cache.size >= this.maxSize) {
            // First key in Map is least recently used (LRU)
            const lruKey = this.cache.keys().next().value;
            this.cache.delete(lruKey);
        }

        // Add to end (most recently used)
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

    /**
     * Clean up expired entries (optional periodic cleanup)
     * Call this periodically to reclaim memory from expired entries
     * @returns {number} Number of entries removed
     */
    cleanExpired() {
        const now = Date.now();
        let removed = 0;

        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp >= this.ttl) {
                this.cache.delete(key);
                removed++;
            }
        }

        return removed;
    }
}

module.exports = { CacheManager };

