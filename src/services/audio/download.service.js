const fs = require('fs');
const { logger } = require('../../utils/logger.util');
const config = require('../../config');
const { downloadFromYouTube } = require('../youtube/download.service');
const { getSpotifyMetadata } = require('../spotify/metadata.service');
const { searchYouTube } = require('../youtube/search.service');
const { isSpotifyUrl, isYouTubeUrl, isFilePath } = require('../../utils/url.util');

/**
 * Audio Download Service
 * Handles downloading audio from various sources (YouTube, Spotify)
 */

/**
 * Download a track from YouTube or Spotify
 * @param {string} url - URL or search query
 * @param {function} progressCallback - Optional progress callback
 * @returns {Promise<{filePath: string, thumbnailPath: string|null, title: string, artist: string, url: string}>}
 */
async function downloadTrack(url, progressCallback = null) {
    const downloadLogger = logger.child({
        component: 'download',
        context: {
            source: 'audio',
            url
        }
    });
    
    const downloadStartTime = Date.now();
    
    try {
        // Validate that input is not a file path
        if (isFilePath(url)) {
            throw new Error(`Cannot download file path as URL: ${url}. File paths should be played directly, not downloaded.`);
        }
        
        downloadLogger.info({
            context: { event: 'download_track_started' }
        }, 'Starting track download');
        
        let title = 'Audio';
        let artist = '';
        let originalTitle = '';
        let originalArtist = '';

        if (isSpotifyUrl(url)) {
            if (progressCallback) progressCallback({ percent: 0, status: 'resolving' });
            downloadLogger.info({
                context: { event: 'spotify_resolve_started' }
            }, 'Resolving Spotify link');

            // Get structured metadata from Spotify
            const metadata = await getSpotifyMetadata(url);
            downloadLogger.info({
                context: {
                    event: 'spotify_metadata_retrieved',
                    title: metadata.title,
                    artist: metadata.primaryArtist || metadata.artist
                }
            }, 'Spotify metadata retrieved');

            // Store original metadata for verification
            originalTitle = metadata.title;
            originalArtist = metadata.primaryArtist || metadata.artist;

            // Search YouTube with verification
            downloadLogger.debug({
                context: { searchQuery: metadata.searchQuery }
            }, 'Searching YouTube for Spotify track');
            const videoInfo = await searchYouTube(metadata.searchQuery, {
                expectedTitle: metadata.title,
                expectedArtist: metadata.primaryArtist || metadata.artist,
                expectedDuration: metadata.duration
            });

            url = videoInfo.url;
            // Use original Spotify title for better consistency
            title = `${originalArtist} - ${originalTitle}`;
            artist = originalArtist;

            downloadLogger.info({
                context: {
                    event: 'youtube_match_found',
                    matchScore: videoInfo.matchScore,
                    youtubeTitle: videoInfo.title
                }
            }, `YouTube match found (score: ${videoInfo.matchScore})`);

        } else if (isYouTubeUrl(url)) {
            if (progressCallback) progressCallback({ percent: 0, status: 'preparing' });
            try {
                // Use cached video info from metadata service to avoid redundant calls
                const { getTrackInfo } = require('../metadata/metadata.service');
                const trackInfo = await getTrackInfo(url);
                title = trackInfo.title;
                artist = trackInfo.artist || '';
            } catch (e) {
                logger.warn(`Failed to get video info for ${url}, trying download directly. Error: ${e.message}`);
                title = `YouTube_Track_${Date.now()}`;
            }
        } else {
            // Treat non-URL as search query
            if (!url.startsWith('http')) {
                if (progressCallback) progressCallback({ percent: 0, status: 'searching' });

                // Try to extract artist and title from query (common formats: "artist - song" or "artist song")
                let expectedTitle = '';
                let expectedArtist = '';

                if (url.includes(' - ')) {
                    const parts = url.split(' - ');
                    expectedArtist = parts[0].trim();
                    expectedTitle = parts.slice(1).join(' - ').trim();
                }

                const videoInfo = await searchYouTube(url, {
                    expectedTitle,
                    expectedArtist
                });

                url = videoInfo.url;
                title = videoInfo.title;
                artist = videoInfo.artist;
            }
        }

        downloadLogger.info({
            context: {
                event: 'download_started',
                title,
                artist,
                targetUrl: url
            }
        }, `Downloading: ${title}`);

        const outputPath = config.getOutputPath(title);

        // Download using YouTube download service
        const downloadResult = await downloadFromYouTube(url, outputPath, title, progressCallback);

        if (!fs.existsSync(downloadResult.audioPath)) {
            downloadLogger.error({
                context: {
                    event: 'download_failed',
                    reason: 'output_file_not_found',
                    expectedPath: downloadResult.audioPath
                }
            }, 'Output file not found after download');
            throw new Error('Output file not found after download');
        }

        const downloadDuration = Date.now() - downloadStartTime;
        const fileStats = fs.statSync(downloadResult.audioPath);
        
        downloadLogger.info({
            context: {
                event: 'download_completed',
                title,
                artist,
                duration: downloadDuration,
                fileSize: fileStats.size,
                filePath: downloadResult.audioPath,
                hasThumbnail: !!downloadResult.thumbnailPath
            }
        }, `Download completed: ${title}`);

        return {
            filePath: downloadResult.audioPath,
            thumbnailPath: downloadResult.thumbnailPath || null,
            title: title,
            artist: artist,
            url: url
        };

    } catch (error) {
        const downloadDuration = Date.now() - downloadStartTime;
        downloadLogger.error({
            context: {
                event: 'download_failed',
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                },
                duration: downloadDuration,
                url
            }
        }, 'Download failed:', error);
        if (progressCallback) progressCallback({ percent: 0, status: 'error', error: error.message });
        throw error;
    }
}

module.exports = {
    downloadTrack
};
