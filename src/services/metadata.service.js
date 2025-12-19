const axios = require('axios');
const cheerio = require('cheerio');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const play = require('play-dl');
const { logger } = require('../utils/logger.util');
const { getSpotifyAccessToken, hasSpotifyCredentials, clearToken } = require('./spotify-auth.service');
const { CacheManager } = require('../utils/cache.util');
const { isSpotifyTrackUrl } = require('../utils/url.util');
const config = require('../config');

const execAsync = promisify(exec);

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
 * Extract video ID from YouTube URL
 * @param {string} url - YouTube URL
 * @returns {string|null} Video ID or null
 */
function extractYouTubeVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

/**
 * Get video info using yt-dlp (fallback method)
 * @param {string} url - YouTube URL
 * @returns {Promise<{title: string, artist: string}>}
 */
async function getVideoInfoWithYtDlp(url) {
    try {
        logger.debug(`[Metadata] Trying yt-dlp to get video info for: ${url}`);
        const { stdout } = await execAsync(`yt-dlp --dump-json --no-playlist "${url}"`, {
            timeout: 10000 // 10 second timeout
        });
        
        const videoData = JSON.parse(stdout);
        const title = videoData.title || '';
        const artist = videoData.uploader || videoData.channel || '';
        
        return { title, artist };
    } catch (error) {
        logger.warn(`[Metadata] yt-dlp fallback failed: ${error.message}`);
        throw error;
    }
}

/**
 * Get video info using YouTube Data API (fallback method)
 * @param {string} url - YouTube URL
 * @returns {Promise<{title: string, artist: string}>}
 */
async function getVideoInfoWithYouTubeAPI(url) {
    try {
        const videoId = extractYouTubeVideoId(url);
        if (!videoId) {
            throw new Error('Could not extract video ID from URL');
        }
        
        const { searchYouTubeAPI, isConfigured } = require('./youtube-api.service');
        if (!isConfigured()) {
            throw new Error('YouTube API not configured');
        }
        
        logger.debug(`[Metadata] Trying YouTube Data API to get video info for: ${url}`);
        
        const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'snippet',
                id: videoId,
                key: config.youtube.apiKey
            }
        });
        
        // Record quota usage (1 unit per videos.list request)
        const { recordQuotaUsage } = require('./youtube-api.service');
        recordQuotaUsage(1);
        
        if (!response.data.items || response.data.items.length === 0) {
            throw new Error('Video not found in YouTube API');
        }
        
        const video = response.data.items[0];
        const title = video.snippet.title || '';
        const artist = video.snippet.channelTitle || '';
        
        return { title, artist };
    } catch (error) {
        logger.warn(`[Metadata] YouTube API fallback failed: ${error.message}`);
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
                let fallbackUsed = false;
                try {
                    // Try play-dl first (primary method)
                    info = await play.video_info(url);
                    videoInfoCache.set(url, info);
                } catch (playDlError) {
                    // Only log as debug since we have fallbacks - don't spam error logs
                    logger.debug(`[Metadata] play-dl failed for ${url} (will try fallbacks): ${playDlError.message}`);
                    fallbackUsed = true;
                    
                    // Fallback 1: Try yt-dlp
                    try {
                        const ytDlpInfo = await getVideoInfoWithYtDlp(url);
                        // Create a compatible info object
                        info = {
                            video_details: {
                                title: ytDlpInfo.title,
                                channel: { name: ytDlpInfo.artist }
                            }
                        };
                        videoInfoCache.set(url, info);
                        logger.info(`[Metadata] Successfully got video info using yt-dlp fallback (play-dl had error: ${playDlError.message})`);
                        // Success with fallback - don't throw, just continue
                    } catch (ytDlpError) {
                        logger.debug(`[Metadata] yt-dlp fallback failed, trying YouTube API: ${ytDlpError.message}`);
                        
                        // Fallback 2: Try YouTube Data API
                        try {
                            const apiInfo = await getVideoInfoWithYouTubeAPI(url);
                            // Create a compatible info object
                            info = {
                                video_details: {
                                    title: apiInfo.title,
                                    channel: { name: apiInfo.artist }
                                }
                            };
                            videoInfoCache.set(url, info);
                            logger.info(`[Metadata] Successfully got video info using YouTube API fallback (play-dl had error: ${playDlError.message})`);
                            // Success with fallback - don't throw, just continue
                        } catch (apiError) {
                            // All methods failed - log as error and return fallback
                            logger.error(`[Metadata] All methods failed for ${url}. play-dl: ${playDlError.message}, yt-dlp: ${ytDlpError.message}, API: ${apiError.message}`);
                            // If all methods fail, try to extract video ID for a better title
                            const videoId = extractYouTubeVideoId(url);
                            const fallbackTitle = videoId ? `YouTube Video ${videoId}` : 'Unknown Track';
                            logger.warn(`[Metadata] Using fallback title: ${fallbackTitle}`);
                            return { title: fallbackTitle, artist: '', url };
                        }
                    }
                }
                
                // If we used a fallback but didn't set info, something went wrong
                if (!info && fallbackUsed) {
                    const videoId = extractYouTubeVideoId(url);
                    const fallbackTitle = videoId ? `YouTube Video ${videoId}` : 'Unknown Track';
                    logger.warn(`[Metadata] Fallbacks attempted but info not set, using fallback title: ${fallbackTitle}`);
                    return { title: fallbackTitle, artist: '', url };
                }
            } else {
                logger.debug(`[Metadata] Using cached video info for: ${url}`);
            }
            
            // Extract title and artist from info object
            if (!info || !info.video_details) {
                const videoId = extractYouTubeVideoId(url);
                const fallbackTitle = videoId ? `YouTube Video ${videoId}` : 'Unknown Track';
                logger.warn(`[Metadata] Invalid info object, using fallback title: ${fallbackTitle}`);
                return { title: fallbackTitle, artist: '', url };
            }
            
            const title = info.video_details.title;
            const artist = info.video_details.channel ? info.video_details.channel.name : '';
            return { title, artist, url };
        }
    } catch (e) {
        // This catch is for unexpected errors outside the YouTube/Spotify handling
        // (e.g., errors in the Spotify path or other unexpected issues)
        logger.error('Unexpected error resolving track info:', e);
        // Try to extract video ID for a better title than the full URL
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = extractYouTubeVideoId(url);
            const fallbackTitle = videoId ? `YouTube Video ${videoId}` : 'Unknown Track';
            logger.warn(`[Metadata] Using fallback title after unexpected error: ${fallbackTitle}`);
            return { title: fallbackTitle, artist: '', url };
        }
        // For non-YouTube URLs, return a generic title
        return { title: 'Unknown Track', artist: '', url };
    }
    return { title: 'Unknown Track', artist: '', url };
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

