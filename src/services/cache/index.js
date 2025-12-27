/**
 * Cache Services
 * Exports all cache-related services
 */

const youtubeCache = require('./youtube-cache.service');

module.exports = {
    youtube: youtubeCache,
    youtubeCache: youtubeCache
};
