const axios = require('axios');
const { logger } = require('../utils/logger');

/**
 * Lyrics Service
 * Handles fetching synced lyrics from LRCLIB API
 */

// In-memory cache for lyrics: { "cleanTitle": { ...lyricsData... } }
const lyricsCache = new Map();

/**
 * Clean up title for better search results
 * @param {string} title - Raw title
 * @returns {string} - Cleaned title
 */
function cleanTitle(title) {
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
function parseSyncedLyrics(lrc) {
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
function findBestMatch(results, targetDuration = null) {
    if (!results || results.length === 0) return null;
    
    // Filter to only results with synced lyrics
    const syncedResults = results.filter(l => l.syncedLyrics);
    const candidates = syncedResults.length > 0 ? syncedResults : results;
    
    // If we have a target duration, try to find the closest match
    if (targetDuration && targetDuration > 0) {
        const DURATION_TOLERANCE = 5; // 5 seconds tolerance
        
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
        
        logger.info(`[Lyrics] No duration match within ${DURATION_TOLERANCE}s tolerance, using best available`);
    }
    
    // Return first synced result, or first result if no synced lyrics
    return candidates[0];
}

/**
 * Search and fetch lyrics from LRCLIB
 * @param {string} fullTitle - The full title (usually "Artist - Song" or similar)
 * @param {string} [artist] - Optional artist name
 * @param {number} [duration] - Optional song duration in seconds (helps match correct version)
 * @returns {Promise<Object|null>} - Lyrics data or null
 */
async function getLyrics(fullTitle, artist = '', duration = null) {
    const cleanedTitle = cleanTitle(fullTitle);
    const cacheKey = artist ? `${artist} - ${cleanedTitle}` : cleanedTitle;
    
    if (lyricsCache.has(cacheKey)) {
        logger.info(`[Lyrics] Cache hit for: ${cacheKey}`);
        return lyricsCache.get(cacheKey);
    }
    
    logger.info(`[Lyrics] Searching for: ${cleanedTitle} ${artist ? `by ${artist}` : ''} ${duration ? `(~${Math.round(duration)}s)` : ''}`);
    
    try {
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
        
        // Construct query parameters for direct get
        const params = {};
        if (artistName && trackName) {
            params.artist_name = artistName;
            params.track_name = trackName;
            // LRCLIB supports duration for more accurate matching
            if (duration) {
                params.duration = Math.round(duration);
            }
        } else {
            params.q = cleanedTitle;
        }
        
        const response = await axios.get('https://lrclib.net/api/get', { 
            params: params,
            validateStatus: status => status < 500 // Handle 404 cleanly
        });
        
        if (response.status === 404) {
            // Try simpler search if specific get failed
            const searchResponse = await axios.get('https://lrclib.net/api/search', {
                params: { q: cleanedTitle }
            });
            
            if (searchResponse.data && searchResponse.data.length > 0) {
                logger.info(`[Lyrics] Search returned ${searchResponse.data.length} results`);
                
                // Use smart matching with duration preference
                const bestMatch = findBestMatch(searchResponse.data, duration);
                
                if (!bestMatch) {
                    logger.info(`[Lyrics] No lyrics found for: ${cleanedTitle}`);
                    return null;
                }
                
                const result = {
                    id: bestMatch.id,
                    trackName: bestMatch.trackName,
                    artistName: bestMatch.artistName,
                    duration: bestMatch.duration,
                    plainLyrics: bestMatch.plainLyrics,
                    syncedLyrics: parseSyncedLyrics(bestMatch.syncedLyrics),
                    hasSynced: !!bestMatch.syncedLyrics
                };
                
                lyricsCache.set(cacheKey, result);
                return result;
            }
            
            logger.info(`[Lyrics] No lyrics found for: ${cleanedTitle}`);
            return null;
        }
        
        const data = response.data;
        const result = {
            id: data.id,
            trackName: data.trackName,
            artistName: data.artistName,
            duration: data.duration,
            plainLyrics: data.plainLyrics,
            syncedLyrics: parseSyncedLyrics(data.syncedLyrics),
            hasSynced: !!data.syncedLyrics
        };
        
        logger.info(`[Lyrics] Found lyrics for: ${cleanedTitle} (Synced: ${result.hasSynced}, Lines: ${result.syncedLyrics.length}, Duration: ${result.duration || 'unknown'}s)`);
        
        lyricsCache.set(cacheKey, result);
        return result;
        
    } catch (error) {
        logger.error(`[Lyrics] Error fetching lyrics: ${error.message}`);
        return null;
    }
}

module.exports = {
    getLyrics
};

