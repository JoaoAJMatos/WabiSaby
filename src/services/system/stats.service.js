const { logger } = require('../../utils/logger.util');
const { getThumbnailUrl } = require('../../utils/helpers.util');
const dbService = require('../../infrastructure/database/db.service');

/**
 * Stats Service
 * Manages analytics and statistics with database persistence
 */
class StatsService {
    constructor() {
        // Track start time for uptime calculation
        this.startTime = Date.now();
    }

    /**
     * Extract artist name from title
     * Common formats: "Artist - Song", "Song by Artist", "Artist: Song"
     */
    extractArtist(title) {
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
     * Get all stats
     * @returns {Object} Current stats
     */
    getStats() {
        const overview = dbService.getStatsOverview();
        const playbackState = dbService.getPlaybackState();

        return {
            startTime: this.startTime,
            songsPlayed: overview.songsPlayed,
            totalDuration: overview.totalDuration,
            uptime: Date.now() - this.startTime,
            requesters: {}, // Legacy format - computed on demand
            artists: {}, // Legacy format - computed on demand
            channels: {}, // Legacy format - computed on demand
            hourlyPlays: overview.hourlyDistribution,
            history: [] // Legacy format - use getHistory() instead
        };
    }

    /**
     * Record a played song
     * @param {Object} song - Song data
     */
    recordSongPlayed(song) {
        const requester = song.requester || 'Unknown';
        const title = song.title || song.content || 'Unknown';
        const duration = song.duration || 0;
        const channel = song.channel || song.artist || null;

        // Track artist (extracted from title or provided)
        const artist = this.extractArtist(title) || channel;

        // Get thumbnail URL - check both thumbnailUrl and thumbnail (file path)
        let thumbnailUrl = song.thumbnailUrl || null;
        if (!thumbnailUrl && song.thumbnail) {
            // Convert file path to URL using helper
            thumbnailUrl = getThumbnailUrl(song.thumbnail);
        }

        // Add to play history in database
        dbService.addPlayHistory({
            content: song.content || title,
            title: title,
            artist: artist,
            channel: channel,
            requester: requester,
            sender: song.sender || song.sender_id,
            thumbnail_url: thumbnailUrl,
            thumbnail_path: song.thumbnail,
            duration: duration,
            played_at: Date.now()
        });

        logger.info(`Recorded song: ${title} by ${requester} (artist: ${artist || 'unknown'})`);
    }

    /**
     * Update last played song with additional data (e.g., duration)
     * @param {string} songId - Song content/identifier (usually file path)
     * @param {Object} updates - Data to update
     */
    updateLastSong(songId, updates) {
        if (!songId || !updates) return;

        // Get the most recent history entry
        const history = dbService.getPlayHistory(1, 0);
        if (history.length === 0) return;

        const lastEntry = history[0];

        // Update song record if needed
        if (updates.duration || updates.artist || updates.thumbnailUrl) {
            const song = dbService.getSong(lastEntry.song_id);
            if (song) {
                const songUpdates = {};
                if (updates.duration && (!song.duration || song.duration === 0)) {
                    songUpdates.duration = updates.duration;
                }
                if (updates.artist && !song.artist) {
                    songUpdates.artist = updates.artist;
                }
                if (updates.thumbnailUrl && !song.thumbnail_url) {
                    songUpdates.thumbnail_url = updates.thumbnailUrl;
                }

                if (Object.keys(songUpdates).length > 0) {
                    dbService.getOrCreateSong({
                        content: song.content,
                        title: song.title,
                        ...songUpdates
                    });
                    logger.info(`Updated song data for "${song.title}"`);
                }
            }
        }
    }

    /**
     * Get top requesters
     * @param {number} limit - Max number of requesters to return
     * @returns {Array} Top requesters sorted by count
     */
    getTopRequesters(limit = 20) {
        return dbService.getTopRequesters(limit);
    }

    /**
     * Get recent history
     * @param {number} limit - Max number of songs to return
     * @returns {Array} Recent songs
     */
    getHistory(limit = 20) {
        const history = dbService.getPlayHistory(limit, 0);
        return history.map(item => {
            // Handle timestamp conversion
            // Database stores in seconds, but if value is > 1e10, it's likely corrupted (milliseconds stored as seconds)
            let playedAt;
            if (item.played_at > 1e10) {
                // Already in milliseconds (corrupted data), use as-is
                playedAt = item.played_at;
            } else {
                // Normal case: seconds, convert to milliseconds
                playedAt = item.played_at * 1000;
            }

            return {
                id: item.content,
                title: item.title,
                artist: item.artist,
                requester: item.requester_name,
                thumbnailUrl: item.thumbnail_url,
                duration: item.duration,
                playedAt: playedAt
            };
        });
    }

    /**
     * Get top artists
     * @param {number} limit - Max number to return
     * @returns {Array} Top artists sorted by count
     */
    getTopArtists(limit = 10) {
        return dbService.getTopArtists(limit);
    }

    /**
     * Get top channels/sources
     * @param {number} limit - Max number to return
     * @returns {Array} Top channels sorted by count
     */
    getTopChannels(limit = 10) {
        return dbService.getTopChannels(limit);
    }

    /**
     * Get hourly distribution
     * @returns {Object} Hour to count mapping
     */
    getHourlyDistribution() {
        return dbService.getHourlyDistribution();
    }

    /**
     * Recalculate stats from history (fixes any inconsistencies)
     * Note: With database, stats are always calculated from history, so this is mainly for compatibility
     */
    recalculateFromHistory() {
        // Stats are always calculated from database, so just return current stats
        return this.getStats();
    }

    /**
     * Get overview statistics
     * @returns {Object} Overview data
     */
    getOverview() {
        const overview = dbService.getStatsOverview();
        return {
            ...overview,
            uptime: this.getUptime()
        };
    }

    /**
     * Reset stats (for new session)
     */
    resetStats() {
        this.startTime = Date.now();
        dbService.resetStats();
        logger.info('Stats reset');
    }

    /**
     * Get uptime in milliseconds
     * @returns {number} Uptime in ms
     */
    getUptime() {
        return Date.now() - this.startTime;
    }
}

// Export singleton instance
const statsService = new StatsService();

// Backward compatibility - export methods directly
module.exports = {
    getStats: statsService.getStats.bind(statsService),
    recordSongPlayed: statsService.recordSongPlayed.bind(statsService),
    updateLastSong: statsService.updateLastSong.bind(statsService),
    getTopRequesters: statsService.getTopRequesters.bind(statsService),
    getHistory: statsService.getHistory.bind(statsService),
    getTopArtists: statsService.getTopArtists.bind(statsService),
    getTopChannels: statsService.getTopChannels.bind(statsService),
    getHourlyDistribution: statsService.getHourlyDistribution.bind(statsService),
    getOverview: statsService.getOverview.bind(statsService),
    recalculateFromHistory: statsService.recalculateFromHistory.bind(statsService),
    resetStats: statsService.resetStats.bind(statsService),
    getUptime: statsService.getUptime.bind(statsService),
};

