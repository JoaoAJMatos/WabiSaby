const fs = require('fs');
const path = require('path');
const config = require('../config');
const { logger } = require('../utils/logger');
const { getThumbnailUrl } = require('../utils/helpers');

/**
 * Stats Service
 * Manages analytics and statistics with file persistence
 */

const STATS_FILE = config.files.stats;

// In-memory cache
let statsCache = null;
let startTime = Date.now();

/**
 * Get default stats structure
 */
function getDefaultStats() {
    return {
        startTime: Date.now(),
        songsPlayed: 0,
        totalDuration: 0, // Total playback time in ms
        requesters: {}, // { requesterName: count }
        artists: {}, // { artistName: count }
        channels: {}, // { channelName: count } - YouTube channels
        hourlyPlays: {}, // { hour: count } - 0-23
        history: [], // Array of played songs (last 100)
    };
}

/**
 * Extract artist name from title
 * Common formats: "Artist - Song", "Song by Artist", "Artist: Song"
 */
function extractArtist(title) {
    if (!title) return null;
    
    const separators = [' - ', ' – ', ' — ', ' | ', ': '];
    for (const sep of separators) {
        if (title.includes(sep)) {
            const parts = title.split(sep);
            // Usually "Artist - Song Title"
            return parts[0].trim();
        }
    }
    
    // Check for "by Artist" pattern
    const byMatch = title.match(/\bby\s+([^([\]]+)/i);
    if (byMatch) {
        return byMatch[1].trim();
    }
    
    return null;
}

/**
 * Load stats from file
 * @returns {Object} Stats data
 */
function loadStats() {
    if (statsCache) return statsCache;
    
    if (fs.existsSync(STATS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
            statsCache = {
                ...getDefaultStats(),
                ...data,
            };
            startTime = statsCache.startTime || Date.now();
            logger.info('Loaded stats from file');
            return statsCache;
        } catch (e) {
            logger.error('Error reading stats file:', e);
        }
    }
    
    statsCache = getDefaultStats();
    return statsCache;
}

/**
 * Save stats to file
 */
function saveStats() {
    if (!statsCache) return;
    
    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(statsCache, null, 2));
    } catch (e) {
        logger.error('Error saving stats file:', e);
    }
}

/**
 * Get all stats
 * @returns {Object} Current stats
 */
function getStats() {
    const stats = loadStats();
    return {
        ...stats,
        uptime: Date.now() - startTime,
    };
}

/**
 * Record a played song
 * @param {Object} song - Song data
 */
function recordSongPlayed(song) {
    const stats = loadStats();
    
    const requester = song.requester || 'Unknown';
    const title = song.title || song.content || 'Unknown';
    const duration = song.duration || 0;
    const channel = song.channel || song.artist || null;
    
    // Increment songs played
    stats.songsPlayed++;
    
    // Add to total duration
    if (duration) {
        stats.totalDuration = (stats.totalDuration || 0) + duration;
    }
    
    // Update requester count
    if (!stats.requesters[requester]) {
        stats.requesters[requester] = 0;
    }
    stats.requesters[requester]++;
    
    // Track artist (extracted from title or provided)
    const artist = extractArtist(title) || channel;
    if (artist) {
        if (!stats.artists) stats.artists = {};
        if (!stats.artists[artist]) {
            stats.artists[artist] = 0;
        }
        stats.artists[artist]++;
    }
    
    // Track channel/source
    if (channel) {
        if (!stats.channels) stats.channels = {};
        if (!stats.channels[channel]) {
            stats.channels[channel] = 0;
        }
        stats.channels[channel]++;
    }
    
    // Track hourly plays
    const hour = new Date().getHours();
    if (!stats.hourlyPlays) stats.hourlyPlays = {};
    if (!stats.hourlyPlays[hour]) {
        stats.hourlyPlays[hour] = 0;
    }
    stats.hourlyPlays[hour]++;
    
    // Store song content for later updates
    const songId = song.content || title;
    
    // Get thumbnail URL - check both thumbnailUrl and thumbnail (file path)
    let thumbnailUrl = song.thumbnailUrl || null;
    if (!thumbnailUrl && song.thumbnail) {
        // Convert file path to URL using helper
        thumbnailUrl = getThumbnailUrl(song.thumbnail);
    }
    
    // Add to history
    stats.history.push({
        id: songId,
        title: title,
        artist: artist,
        requester: requester,
        thumbnailUrl: thumbnailUrl,
        duration: duration,
        playedAt: Date.now(),
    });
    
    // Keep only last 100 songs
    if (stats.history.length > 100) {
        stats.history = stats.history.slice(-100);
    }
    
    saveStats();
    logger.info(`Recorded song: ${title} by ${requester} (artist: ${artist || 'unknown'})`);
}

/**
 * Update last played song with additional data (e.g., duration)
 * @param {string} songId - Song content/identifier (usually file path)
 * @param {Object} updates - Data to update
 */
function updateLastSong(songId, updates) {
    if (!songId || !updates) return;
    
    const stats = loadStats();
    
    // Find the most recent song in history that needs updating
    // Match by id, title, or just update the most recent if it has no duration
    for (let i = stats.history.length - 1; i >= 0; i--) {
        const item = stats.history[i];
        
        // Check various ways to match
        const matchById = item.id && songId.includes(item.id);
        const matchByIdReverse = songId && item.id && item.id.includes(songId);
        const matchByTitle = item.title && songId.toLowerCase().includes(item.title.toLowerCase());
        const matchByContent = songId.includes(item.title?.replace(/[^a-zA-Z0-9]/g, '_') || '');
        
        // Also match if this is the most recent song and it needs duration
        const isMostRecent = i === stats.history.length - 1;
        const needsDuration = !item.duration || item.duration === 0;
        
        if (matchById || matchByIdReverse || matchByTitle || matchByContent || (isMostRecent && needsDuration)) {
            let updated = false;
            
            // Update duration if provided and not already set (0 counts as not set)
            if (updates.duration && updates.duration > 0 && (!item.duration || item.duration === 0)) {
                stats.history[i].duration = updates.duration;
                stats.totalDuration = (stats.totalDuration || 0) + updates.duration;
                
                // Also set the id if missing
                if (!stats.history[i].id) {
                    stats.history[i].id = songId;
                }
                
                logger.info(`Updated song duration: ${updates.duration}ms for "${item.title}"`);
                updated = true;
            }
            
            // Update artist if provided and not already set
            if (updates.artist && !item.artist) {
                stats.history[i].artist = updates.artist;
                
                if (!stats.artists) stats.artists = {};
                if (!stats.artists[updates.artist]) {
                    stats.artists[updates.artist] = 0;
                }
                stats.artists[updates.artist]++;
                updated = true;
            }
            
            // Update thumbnail if provided and not already set
            if (updates.thumbnailUrl && !item.thumbnailUrl) {
                stats.history[i].thumbnailUrl = updates.thumbnailUrl;
                logger.info(`Updated thumbnail for "${item.title}"`);
                updated = true;
            }
            
            if (updated) {
                saveStats();
            }
            break;
        }
    }
}

/**
 * Get top requesters
 * @param {number} limit - Max number of requesters to return
 * @returns {Array} Top requesters sorted by count
 */
function getTopRequesters(limit = 20) {
    const stats = loadStats();
    
    return Object.entries(stats.requesters)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([name, count], index) => ({
            rank: index + 1,
            name,
            count,
        }));
}

/**
 * Get recent history
 * @param {number} limit - Max number of songs to return
 * @returns {Array} Recent songs
 */
function getHistory(limit = 20) {
    const stats = loadStats();
    return stats.history.slice(-limit).reverse();
}

/**
 * Get top artists
 * @param {number} limit - Max number to return
 * @returns {Array} Top artists sorted by count
 */
function getTopArtists(limit = 10) {
    const stats = loadStats();
    
    if (!stats.artists) return [];
    
    return Object.entries(stats.artists)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([name, count], index) => ({
            rank: index + 1,
            name,
            count,
        }));
}

/**
 * Get top channels/sources
 * @param {number} limit - Max number to return
 * @returns {Array} Top channels sorted by count
 */
function getTopChannels(limit = 10) {
    const stats = loadStats();
    
    if (!stats.channels) return [];
    
    return Object.entries(stats.channels)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([name, count], index) => ({
            rank: index + 1,
            name,
            count,
        }));
}

/**
 * Get hourly distribution
 * @returns {Object} Hour to count mapping
 */
function getHourlyDistribution() {
    const stats = loadStats();
    return stats.hourlyPlays || {};
}

/**
 * Recalculate stats from history (fixes any inconsistencies)
 */
function recalculateFromHistory() {
    const stats = loadStats();
    
    // Recalculate totalDuration from history
    let totalDuration = 0;
    for (const song of stats.history) {
        if (song.duration && song.duration > 0) {
            totalDuration += song.duration;
        }
    }
    
    // Only update if different
    if (stats.totalDuration !== totalDuration) {
        logger.info(`Recalculating totalDuration: ${stats.totalDuration} -> ${totalDuration}`);
        stats.totalDuration = totalDuration;
        saveStats();
    }
    
    return stats;
}

/**
 * Get overview statistics
 * @returns {Object} Overview data
 */
function getOverview() {
    // Recalculate to ensure accuracy
    const stats = recalculateFromHistory();
    
    // Count songs with valid duration for accurate average
    let songsWithDuration = 0;
    let totalDurationFromHistory = 0;
    
    for (const song of stats.history) {
        if (song.duration && song.duration > 0) {
            songsWithDuration++;
            totalDurationFromHistory += song.duration;
        }
    }
    
    // Calculate average song duration (only from songs with known duration)
    const avgDuration = songsWithDuration > 0 
        ? Math.floor(totalDurationFromHistory / songsWithDuration) 
        : 0;
    
    // Find peak hour
    let peakHour = null;
    let peakCount = 0;
    if (stats.hourlyPlays) {
        for (const [hour, count] of Object.entries(stats.hourlyPlays)) {
            if (count > peakCount) {
                peakCount = count;
                peakHour = parseInt(hour);
            }
        }
    }
    
    // Get unique requesters count
    const uniqueRequesters = Object.keys(stats.requesters || {}).length;
    
    // Get unique artists count
    const uniqueArtists = Object.keys(stats.artists || {}).length;
    
    return {
        songsPlayed: stats.songsPlayed,
        totalDuration: totalDurationFromHistory,
        avgDuration,
        uniqueRequesters,
        uniqueArtists,
        peakHour,
        peakHourCount: peakCount,
        topArtists: getTopArtists(5),
        topChannels: getTopChannels(5),
        hourlyDistribution: stats.hourlyPlays || {},
    };
}

/**
 * Reset stats (for new session)
 */
function resetStats() {
    startTime = Date.now();
    statsCache = getDefaultStats();
    saveStats();
    logger.info('Stats reset');
}

/**
 * Get uptime in milliseconds
 * @returns {number} Uptime in ms
 */
function getUptime() {
    return Date.now() - startTime;
}

// Load stats on module init
loadStats();

module.exports = {
    getStats,
    recordSongPlayed,
    updateLastSong,
    getTopRequesters,
    getHistory,
    getTopArtists,
    getTopChannels,
    getHourlyDistribution,
    getOverview,
    recalculateFromHistory,
    resetStats,
    getUptime,
};

