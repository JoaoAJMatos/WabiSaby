const axios = require('axios');
const cheerio = require('cheerio');
const { spawn } = require('child_process');
const play = require('play-dl');
const { logger } = require('../utils/logger');
const { getSpotifyAccessToken, hasSpotifyCredentials, clearToken } = require('./spotify-auth.service');
const { CacheManager } = require('../utils/cache.util');
const { isSpotifyTrackUrl } = require('../utils/url.util');

// Cache for video info to avoid redundant API calls
const videoInfoCache = new CacheManager({ ttl: 10 * 60 * 1000, maxSize: 100 }); // 10 minutes TTL, 100 entries max

/**
 * Clear video info cache
 */
function clearVideoInfoCache() {
    videoInfoCache.clear();
}

/**
 * Metadata Service
 * Handles fetching titles, durations, and other metadata for audio tracks
 */

/**
 * Extract track ID from Spotify URL
 * @param {string} url - Spotify URL
 * @returns {string|null} Track ID or null
 */
function extractSpotifyTrackId(url) {
    const trackMatch = url.match(/track\/([a-zA-Z0-9]+)/);
    return trackMatch ? trackMatch[1] : null;
}

/**
 * Get track metadata from Spotify API
 * @param {string} url - Spotify track URL
 * @returns {Promise<{title: string, artist: string, searchQuery: string, duration: number}>}
 */
async function getSpotifyTrackMetadata(url) {
    const trackId = extractSpotifyTrackId(url);
    if (!trackId) {
        throw new Error('Could not extract Spotify track ID from URL');
    }

    try {
        const token = await getSpotifyAccessToken();
        const response = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const track = response.data;
        const title = track.name;
        const artists = track.artists.map(a => a.name).join(', ');
        const primaryArtist = track.artists[0]?.name || '';
        const duration = Math.floor(track.duration_ms / 1000); // Duration in seconds

        // Construct optimized search query: "Artist - Song" format works best
        const searchQuery = `${primaryArtist} - ${title}`;

        logger.info(`[Spotify API] Track: "${title}" by ${artists} (${duration}s)`);

        return {
            title,
            artist: artists,
            primaryArtist,
            searchQuery,
            duration
        };
    } catch (error) {
        if (error.response?.status === 401) {
            clearToken();
        }
        logger.error(`[Spotify API] Failed to fetch track: ${error.message}`);
        throw error;
    }
}

/**
 * Get detailed track info (title, artist) from URL
 * @param {string} url - The URL to fetch info from
 * @returns {Promise<{title: string, artist: string, url: string}>} - The track info
 */
async function getTrackInfo(url) {
    try {
        if (url.includes('spotify.com')) {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            const title = $('meta[property="og:title"]').attr('content') || 'Spotify Track';
            const description = $('meta[property="og:description"]').attr('content');
            
            // Try to extract artist from description or other meta tags
            let artist = '';
            
            // Spotify descriptions are often "ARTIST · Song · 2023" or similar
            if (description) {
                const parts = description.split('·');
                if (parts.length > 0) {
                    artist = parts[0].trim();
                }
            }
            
            // Fallback: check for explicit artist meta tag if it exists (og:audio:artist often doesn't exist on track pages)
            if (!artist) {
                // Sometimes title is "Song - Artist" or "Song by Artist"
                 const titleParts = title.split(' - ');
                 if (titleParts.length > 1) {
                     // Usually "Song - Artist"
                     artist = titleParts[1].trim();
                 }
            }

            return { title, artist, url };

        } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // Check cache first to avoid redundant API calls
            let info = videoInfoCache.get(url);
            if (!info) {
                info = await play.video_info(url);
                videoInfoCache.set(url, info);
            } else {
                logger.debug(`[Metadata] Using cached video info for: ${url}`);
            }
            const title = info.video_details.title;
            const artist = info.video_details.channel ? info.video_details.channel.name : '';
            return { title, artist, url };
        }
    } catch (e) {
        logger.error('Error resolving track info:', e);
    }
    return { title: url, artist: '', url };
}

/**
 * Get title from URL (YouTube or Spotify)
 * @param {string} url - The URL to fetch title from
 * @returns {Promise<string>} - The track title
 */
async function getTitle(url) {
    const info = await getTrackInfo(url);
    return info.title;
}

/**
 * Get audio duration using ffprobe
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<number>} - Duration in milliseconds
 */
async function getAudioDuration(filePath) {
    return new Promise((resolve) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);
        
        let output = '';
        ffprobe.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        ffprobe.on('close', () => {
            const duration = parseFloat(output);
            resolve(isNaN(duration) ? 0 : Math.floor(duration * 1000)); // Return in milliseconds
        });
        
        ffprobe.on('error', () => {
            resolve(0);
        });
    });
}

/**
 * Get Spotify metadata using API (preferred) or web scraping (fallback)
 * @param {string} url - Spotify URL
 * @returns {Promise<{searchQuery: string, title: string, artist: string, duration: number|null}>}
 */
async function getSpotifyMetadata(url) {
    // Validate that this is a track URL, not an album or playlist
    if (!isSpotifyTrackUrl(url)) {
        throw new Error('Only individual Spotify track URLs are supported. Album and playlist URLs are not allowed. Please use the !playlist command for albums/playlists.');
    }

    // Try Spotify API first if credentials are available
    if (hasSpotifyCredentials()) {
        try {
            const metadata = await getSpotifyTrackMetadata(url);
            return {
                searchQuery: metadata.searchQuery,
                title: metadata.title,
                artist: metadata.artist,
                primaryArtist: metadata.primaryArtist,
                duration: metadata.duration
            };
        } catch (apiError) {
            // If the error is about not being able to extract track ID, don't fall back to scraping
            if (apiError.message.includes('Could not extract Spotify track ID')) {
                throw new Error('Only individual Spotify track URLs are supported. Album and playlist URLs are not allowed.');
            }
            logger.warn(`[Spotify] API failed, falling back to web scraping: ${apiError.message}`);
        }
    }

    // Fallback to web scraping (only for track URLs)
    try {
        logger.info('[Spotify] Using web scraping (no API credentials or API failed)');
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const title = $('meta[property="og:title"]').attr('content') || 'Unknown';
        const description = $('meta[property="og:description"]').attr('content') || '';
        
        // Try to extract artist from description (format: "ARTIST · Song · 2023")
        let artist = '';
        if (description) {
            const parts = description.split('·');
            if (parts.length > 0) {
                artist = parts[0].trim();
            }
        }

        // Construct a better search query
        const searchQuery = artist ? `${artist} - ${title}` : title;

        return {
            searchQuery,
            title,
            artist,
            primaryArtist: artist,
            duration: null
        };
    } catch (error) {
        logger.error('[Spotify] Error scraping:', error);
        throw new Error('Failed to resolve Spotify link');
    }
}

module.exports = {
    getTitle,
    getTrackInfo,
    getAudioDuration,
    getSpotifyMetadata,
    getSpotifyTrackMetadata,
    hasSpotifyCredentials,
    clearVideoInfoCache
};

