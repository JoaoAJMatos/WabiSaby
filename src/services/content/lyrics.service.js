const axios = require('axios');
const { logger } = require('../../utils/logger.util');

/**
 * Lyrics Service
 * Handles fetching synced lyrics from LRCLIB API
 */
class LyricsService {
    constructor() {
        // In-memory cache for lyrics: { "cleanTitle": { ...lyricsData... } }
        this.lyricsCache = new Map();
    }

    /**
     * Clean up title for better search results
     * @param {string} title - Raw title
     * @returns {string} - Cleaned title
     */
    cleanTitle(title) {
        return title
            .replace(/\(Official Video\)/gi, '')
            .replace(/\(Official Music Video\)/gi, '')
            .replace(/\(Official Audio\)/gi, '')
            .replace(/\(Video\)/gi, '')
            .replace(/\(Audio\)/gi, '')
            .replace(/\(Lyrics\)/gi, '')
            .replace(/\(Lyric Video\)/gi, '')
            .replace(/\[.*?\]/g, '') // Remove [text]
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Parse LRC format string into structured data
     * @param {string} lrc - Raw LRC string
     * @returns {Array<{time: number, text: string}>} - Parsed lyrics
     */
    parseSyncedLyrics(lrc) {
        if (!lrc) return [];

        const lines = lrc.split('\n');
        const result = [];

        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

        for (const line of lines) {
            const match = line.match(timeRegex);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const milliseconds = parseInt(match[3].padEnd(3, '0').substring(0, 3));

                const timeInSeconds = (minutes * 60) + seconds + (milliseconds / 1000);
                const text = line.replace(timeRegex, '').trim();

                if (text) {
                    result.push({
                        time: timeInSeconds,
                        text: text
                    });
                }
            }
        }

        return result;
    }

    /**
     * Find best matching lyrics from search results
     * @param {Array} results - Search results from LRCLIB
     * @param {number|null} targetDuration - Target song duration in seconds
     * @returns {Object|null} - Best matching result
     */
    findBestMatch(results, targetDuration = null) {
        if (!results || results.length === 0) return null;

        // Filter to only results with synced lyrics
        const syncedResults = results.filter(l => l.syncedLyrics);
        const candidates = syncedResults.length > 0 ? syncedResults : results;

        // If we have a target duration, try to find the closest match
        if (targetDuration && targetDuration > 0) {
            const DURATION_TOLERANCE = 15; // 15 seconds tolerance (more lenient for variations)

            // Find results within tolerance
            const durationMatches = candidates.filter(l =>
                l.duration && Math.abs(l.duration - targetDuration) <= DURATION_TOLERANCE
            );

            if (durationMatches.length > 0) {
                // Sort by duration difference (closest first)
                durationMatches.sort((a, b) =>
                    Math.abs(a.duration - targetDuration) - Math.abs(b.duration - targetDuration)
                );
                logger.info(`[Lyrics] Found duration match: ${durationMatches[0].duration}s (target: ${targetDuration}s)`);
                return durationMatches[0];
            }

            logger.info(`[Lyrics] No duration match within ${DURATION_TOLERANCE}s tolerance, trying fallback logic`);

            // Fallback: sort all candidates by duration difference and pick the closest
            const sortedByDuration = candidates
                .filter(l => l.duration)
                .sort((a, b) => Math.abs(a.duration - targetDuration) - Math.abs(b.duration - targetDuration));

            if (sortedByDuration.length > 0) {
                const bestFallback = sortedByDuration[0];
                const diff = Math.abs(bestFallback.duration - targetDuration);
                logger.info(`[Lyrics] Using closest duration match: ${bestFallback.duration}s (diff: ${diff}s, target: ${targetDuration}s)`);
                return bestFallback;
            }
        }

        // Last resort: return first result with preference for synced lyrics
        const bestResult = candidates[0];
        logger.info(`[Lyrics] Using first available result: ${bestResult.trackName} by ${bestResult.artistName} (${bestResult.duration || 'unknown'}s, synced: ${!!bestResult.syncedLyrics})`);
        return bestResult;
    }

    /**
     * Search and fetch lyrics from LRCLIB
     * @param {string} fullTitle - The full title (usually "Artist - Song" or similar)
     * @param {string} [artist] - Optional artist name
     * @param {number} [duration] - Optional song duration in seconds (helps match correct version)
     * @returns {Promise<Object|null>} - Lyrics data or null
     */
    async getLyrics(fullTitle, artist = '', duration = null) {
        const cleanedTitle = this.cleanTitle(fullTitle);
        const cacheKey = artist ? `${artist} - ${cleanedTitle}` : cleanedTitle;

        if (this.lyricsCache.has(cacheKey)) {
            logger.info(`[Lyrics] Cache hit for: ${cacheKey}`);
            return this.lyricsCache.get(cacheKey);
        }

        logger.info(`[Lyrics] Searching for: ${cleanedTitle} ${artist ? `by ${artist}` : ''} ${duration ? `(~${Math.round(duration)}s)` : ''}`);

        try {
            // Try multiple search strategies
            const searchStrategies = [];

            // First try to guess artist/track from "Artist - Track" format
            let trackName = cleanedTitle;
            let artistName = artist || '';

            if (!artistName && cleanedTitle.includes(' - ')) {
                const parts = cleanedTitle.split(' - ');
                if (parts.length >= 2) {
                    artistName = parts[0].trim();
                    trackName = parts[1].trim();
                }
            }

            // Strategy 1: Direct get with artist and track
            if (artistName && trackName) {
                searchStrategies.push({
                    type: 'direct',
                    params: {
                        artist_name: artistName,
                        track_name: trackName,
                        ...(duration && { duration: Math.round(duration) })
                    }
                });
            }

            // Strategy 2: Search with full title
            searchStrategies.push({
                type: 'search',
                params: { q: cleanedTitle }
            });

            // Strategy 3: Search with just track name (if we have artist)
            if (artistName && trackName) {
                searchStrategies.push({
                    type: 'search',
                    params: { q: trackName }
                });
            }

            // Strategy 4: Search with artist + track combined
            if (artistName && trackName) {
                searchStrategies.push({
                    type: 'search',
                    params: { q: `${artistName} ${trackName}` }
                });
            }

            // Try each strategy
            for (const strategy of searchStrategies) {
                try {
                    let response;

                    if (strategy.type === 'direct') {
                        response = await axios.get('https://lrclib.net/api/get', {
                            params: strategy.params,
                            validateStatus: status => status < 500 // Handle 404 cleanly
                        });

                        if (response.status === 200) {
                            const data = response.data;
                            const result = {
                                id: data.id,
                                trackName: data.trackName,
                                artistName: data.artistName,
                                duration: data.duration,
                                plainLyrics: data.plainLyrics,
                                syncedLyrics: this.parseSyncedLyrics(data.syncedLyrics),
                                hasSynced: !!data.syncedLyrics
                            };

                                            logger.info(`[Lyrics] ✅ Found lyrics via direct API: "${data.trackName}" by ${data.artistName} (Synced: ${result.hasSynced}, Duration: ${result.duration || 'unknown'}s, Lines: ${result.syncedLyrics.length})`);
                            this.lyricsCache.set(cacheKey, result);
                            return result;
                        }
                    } else if (strategy.type === 'search') {
                        response = await axios.get('https://lrclib.net/api/search', {
                            params: strategy.params
                        });

                        if (response.data && response.data.length > 0) {
                            logger.info(`[Lyrics] Search strategy "${strategy.params.q}" returned ${response.data.length} results`);

                            // Use smart matching with duration preference
                            const bestMatch = this.findBestMatch(response.data, duration);

                            if (bestMatch) {
                                const result = {
                                    id: bestMatch.id,
                                    trackName: bestMatch.trackName,
                                    artistName: bestMatch.artistName,
                                    duration: bestMatch.duration,
                                    plainLyrics: bestMatch.plainLyrics,
                                    syncedLyrics: this.parseSyncedLyrics(bestMatch.syncedLyrics),
                                    hasSynced: !!bestMatch.syncedLyrics
                                };

                                logger.info(`[Lyrics] ✅ Selected lyrics: "${bestMatch.trackName}" by ${bestMatch.artistName} (Synced: ${result.hasSynced}, Duration: ${result.duration || 'unknown'}s, Lines: ${result.syncedLyrics.length})`);
                                this.lyricsCache.set(cacheKey, result);
                                return result;
                            }
                        }
                    }
                } catch (strategyError) {
                    logger.debug(`[Lyrics] Strategy failed: ${strategy.type} - ${strategyError.message}`);
                    // Continue to next strategy
                }
            }

            logger.info(`[Lyrics] No lyrics found after trying ${searchStrategies.length} strategies for: ${cleanedTitle}`);
            return null;

            const data = response.data;
            const result = {
                id: data.id,
                trackName: data.trackName,
                artistName: data.artistName,
                duration: data.duration,
                plainLyrics: data.plainLyrics,
                syncedLyrics: this.parseSyncedLyrics(data.syncedLyrics),
                hasSynced: !!data.syncedLyrics
            };

            logger.info(`[Lyrics] ✅ Found lyrics: "${result.trackName}" by ${result.artistName} (Synced: ${result.hasSynced}, Lines: ${result.syncedLyrics.length}, Duration: ${result.duration || 'unknown'}s)`);

            this.lyricsCache.set(cacheKey, result);
            return result;

        } catch (error) {
            logger.error(`[Lyrics] Error fetching lyrics: ${error.message}`);
            return null;
        }
    }
}

// Export singleton instance
const lyricsService = new LyricsService();

// Backward compatibility - export methods directly
module.exports = {
    getLyrics: lyricsService.getLyrics.bind(lyricsService)
};

