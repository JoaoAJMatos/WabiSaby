const axios = require('axios');
const { exec } = require('child_process');
const { logger } = require('../../utils/logger.util');
const { getSpotifyAccessToken, clearToken } = require('../spotify/auth.service');
const { isSpotifyPlaylist, isYouTubePlaylist, isPlaylistUrl } = require('../../utils/url.util');

/**
 * Playlist Service
 * Handles extracting tracks from Spotify and YouTube playlists
 */


/**
 * Extract playlist or album ID from Spotify URL
 * @param {string} url - Spotify URL
 * @returns {{type: string, id: string}} Type and ID
 */
function extractSpotifyId(url) {
    const playlistMatch = url.match(/playlist\/([a-zA-Z0-9]+)/);
    if (playlistMatch) {
        return { type: 'playlist', id: playlistMatch[1] };
    }

    const albumMatch = url.match(/album\/([a-zA-Z0-9]+)/);
    if (albumMatch) {
        return { type: 'album', id: albumMatch[1] };
    }

    throw new Error('Could not extract Spotify playlist/album ID from URL');
}

/**
 * Extract tracks from Spotify playlist using official API
 * @param {string} url - Spotify playlist/album URL
 * @returns {Promise<Array<{title: string, artist: string, searchQuery: string}>>}
 */
async function getSpotifyPlaylistTracks(url) {
    try {
        logger.info(`Fetching Spotify playlist: ${url}`);
        
        const token = await getSpotifyAccessToken();
        const { type, id } = extractSpotifyId(url);
        
        const tracks = [];
        let nextUrl = null;
        
        if (type === 'playlist') {
            // Fetch playlist tracks (paginated)
            nextUrl = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100`;
            
            while (nextUrl) {
                const response = await axios.get(nextUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                response.data.items.forEach(item => {
                    if (item.track && item.track.name) {
                        const trackName = item.track.name;
                        const artists = item.track.artists.map(a => a.name).join(' ');
                        tracks.push({
                            title: trackName,
                            artist: artists,
                            searchQuery: `${trackName} ${artists}`
                        });
                    }
                });
                
                nextUrl = response.data.next;
            }
        } else if (type === 'album') {
            // Fetch album tracks (paginated)
            nextUrl = `https://api.spotify.com/v1/albums/${id}/tracks?limit=50`;
            
            // Also get album info for artist name
            const albumResponse = await axios.get(`https://api.spotify.com/v1/albums/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const albumArtists = albumResponse.data.artists.map(a => a.name).join(' ');
            
            while (nextUrl) {
                const response = await axios.get(nextUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                response.data.items.forEach(item => {
                    if (item.name) {
                        const trackName = item.name;
                        // Use track artists if available, otherwise use album artists
                        const artists = item.artists?.map(a => a.name).join(' ') || albumArtists;
                        tracks.push({
                            title: trackName,
                            artist: artists,
                            searchQuery: `${trackName} ${artists}`
                        });
                    }
                });
                
                nextUrl = response.data.next;
            }
        }
        
        logger.info(`Found ${tracks.length} tracks in Spotify ${type}`);
        return tracks;
        
    } catch (error) {
        if (error.response?.status === 401) {
            // Token might be invalid, clear cache and retry once
            clearToken();
            logger.warn('Spotify token invalid, retrying with new token...');
            throw new Error('Spotify authentication failed. Please check your API credentials.');
        }
        
        logger.error(`Failed to fetch Spotify playlist: ${error.message}`);
        throw new Error(`Could not fetch Spotify ${extractSpotifyId(url).type}: ${error.message}`);
    }
}

/**
 * Extract video URLs from YouTube playlist using yt-dlp
 * @param {string} url - YouTube playlist URL
 * @returns {Promise<Array<{url: string, title: string}>>}
 */
async function getYouTubePlaylistTracks(url) {
    try {
        logger.info(`Fetching YouTube playlist: ${url}`);
        
        return new Promise((resolve, reject) => {
            // Use yt-dlp to get playlist info
            const cmd = `yt-dlp --flat-playlist --print "%(url)s|%(title)s" "${url}"`;
            
            exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    logger.error(`Error fetching YouTube playlist: ${error.message}`);
                    logger.error(`stderr: ${stderr}`);
                    reject(new Error(`Failed to fetch YouTube playlist: ${error.message}`));
                    return;
                }
                
                const lines = stdout.trim().split('\n').filter(line => line.trim());
                const tracks = lines.map(line => {
                    const [videoId, title] = line.split('|');
                    return {
                        url: `https://www.youtube.com/watch?v=${videoId}`,
                        title: title || 'Unknown Title'
                    };
                }).filter(track => track.url && track.title);
                
                logger.info(`Found ${tracks.length} videos in YouTube playlist`);
                resolve(tracks);
            });
        });
    } catch (error) {
        logger.error(`Failed to fetch YouTube playlist: ${error.message}`);
        throw new Error('Could not fetch YouTube playlist');
    }
}

/**
 * Get all tracks from a playlist (Spotify or YouTube)
 * @param {string} url - Playlist URL
 * @returns {Promise<Array<{url?: string, searchQuery?: string, title: string}>>}
 */
async function getPlaylistTracks(url) {
    if (isSpotifyPlaylist(url)) {
        return await getSpotifyPlaylistTracks(url);
    } else if (isYouTubePlaylist(url)) {
        return await getYouTubePlaylistTracks(url);
    } else {
        throw new Error('Not a valid Spotify or YouTube playlist URL');
    }
}

module.exports = {
    getSpotifyPlaylistTracks,
    getYouTubePlaylistTracks,
    getPlaylistTracks
};

