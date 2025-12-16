const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const play = require('play-dl');
const { logger } = require('../utils/logger.util');
const config = require('../config');
const { getSpotifyMetadata } = require('./metadata.service');
const { searchYouTube } = require('./search.service');
const { CacheManager } = require('../utils/cache.util');
const { isSpotifyUrl, isYouTubeUrl } = require('../utils/url.util');

// Validation cache for URL validation (shared with search service)
const validationCache = new CacheManager({ ttl: Infinity, maxSize: 200 }); // No expiration, 200 entries max

// Set validation cache in search service (to avoid circular dependency)
const { setValidationCache } = require('./search.service');
setValidationCache(validationCache);

/**
 * Clear validation cache (useful when queue is cleared)
 * Note: Search cache is cleared separately via search service
 */
function clearCaches() {
    validationCache.clear();
}

/**
 * Download Service
 * Handles downloading audio from YouTube and Spotify
 */

/**
 * Downloads audio using yt-dlp command line tool
 * @param {string} url - The URL to download
 * @param {string} outputPath - The output path for audio
 * @param {string} title - The track title (for thumbnail naming)
 * @param {function} progressCallback - Optional callback for progress updates
 * @returns {Promise<{audioPath: string, thumbnailPath: string|null}>}
 */
async function downloadWithYtDlp(url, outputPath, title = '', progressCallback = null) {
    try {
        logger.info(`[downloadWithYtDlp] Starting download for URL: ${url}`);
        
        // Validate URL
        if (!url || !url.startsWith('http')) {
            throw new Error(`Invalid URL provided: ${url}`);
        }

        // Validate the YouTube URL using play-dl's validation (use cache)
        logger.info(`[downloadWithYtDlp] Validating URL with play.yt_validate...`);
        let validated = validationCache.get(url);
        if (!validated) {
            validated = play.yt_validate(url);
            validationCache.set(url, validated);
        }
        logger.info(`[downloadWithYtDlp] Validation result: ${validated}`);
        
        if (validated !== 'video') {
            throw new Error(`URL is not a valid YouTube video: ${url} (type: ${validated})`);
        }

        // Get thumbnail path in organized thumbnails directory
        const thumbnailPath = config.download.downloadThumbnails 
            ? config.getThumbnailPath(title, url)
            : null;

        // Use yt-dlp via command line
        logger.info(`[downloadWithYtDlp] Attempting download with yt-dlp...`);
        
        return new Promise((resolve, reject) => {
            // Build yt-dlp command with config options
            let thumbnailFlags = '';
            if (config.download.downloadThumbnails && thumbnailPath) {
                // Download thumbnail and convert to desired format
                // Note: yt-dlp will save thumbnail next to audio file, we'll move it later
                thumbnailFlags = `--write-thumbnail --convert-thumbnails ${config.download.thumbnailFormat}`;
            }
            
            const audioOutputTemplate = outputPath.replace(`.${config.download.audioFormat}`, '') + `.%(ext)s`;
            const ytDlpCmd = `yt-dlp -x --audio-format ${config.download.audioFormat} --audio-quality ${config.download.audioQuality} ${thumbnailFlags} --newline --extractor-args "youtube:player_client=${config.download.playerClient}" -o "${audioOutputTemplate}" "${url}"`;
            logger.info(`[downloadWithYtDlp] Running: ${ytDlpCmd}`);
            
            const process = exec(ytDlpCmd);
            let stderrOutput = '';
            
            // Track progress from stdout
            process.stdout.on('data', (data) => {
                const output = data.toString();
                
                // Parse yt-dlp progress: [download]  45.3% of 3.24MiB at 1.23MiB/s ETA 00:02
                const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
                if (progressMatch && progressCallback) {
                    const percent = parseFloat(progressMatch[1]);
                    progressCallback({ percent, status: 'downloading' });
                }
                
                // Check for post-processing
                if (output.includes('[ExtractAudio]') || output.includes('[ffmpeg]')) {
                    if (progressCallback) {
                        progressCallback({ percent: 95, status: 'converting' });
                    }
                }
            });
            
            // Capture error output
            process.stderr.on('data', (data) => {
                stderrOutput += data.toString();
            });
            
            process.on('close', (code) => {
                if (code !== 0) {
                    logger.error(`[downloadWithYtDlp] yt-dlp stderr: ${stderrOutput}`);
                    reject(new Error(`yt-dlp exited with code ${code}: ${stderrOutput.substring(0, 200)}`));
                    return;
                }
                
                // yt-dlp will create the file, we just need to find it
                const expectedPath = outputPath.replace(`.${config.download.audioFormat}`, '') + `.${config.download.audioFormat}`;
                
                if (fs.existsSync(expectedPath)) {
                    logger.info(`[downloadWithYtDlp] Download complete: ${expectedPath}`);
                    
                    if (progressCallback) {
                        progressCallback({ percent: 100, status: 'complete' });
                    }
                    
                    // Check if thumbnail was downloaded and move it to desired location
                    const result = { audioPath: expectedPath };
                    if (config.download.downloadThumbnails && thumbnailPath) {
                        // Thumbnail will be saved next to audio file with same base name
                        const audioDir = path.dirname(expectedPath);
                        const audioBaseName = path.basename(expectedPath, path.extname(expectedPath));
                        const thumbnailExtension = config.download.thumbnailFormat || 'jpg';
                        const tempThumbnailPath = path.join(audioDir, `${audioBaseName}.${thumbnailExtension}`);
                        
                        // Check if thumbnail exists in temp location
                        if (fs.existsSync(tempThumbnailPath)) {
                            try {
                                // Ensure thumbnail directory exists
                                const thumbnailDir = path.dirname(thumbnailPath);
                                if (!fs.existsSync(thumbnailDir)) {
                                    fs.mkdirSync(thumbnailDir, { recursive: true });
                                }
                                
                                // Move thumbnail to desired location
                                fs.renameSync(tempThumbnailPath, thumbnailPath);
                                logger.info(`[downloadWithYtDlp] Thumbnail moved to: ${thumbnailPath}`);
                                result.thumbnailPath = thumbnailPath;
                            } catch (moveError) {
                                logger.warn(`[downloadWithYtDlp] Failed to move thumbnail: ${moveError.message}`);
                                // If move fails, use temp location
                                if (fs.existsSync(tempThumbnailPath)) {
                                    result.thumbnailPath = tempThumbnailPath;
                                }
                            }
                        } else {
                            logger.warn(`[downloadWithYtDlp] Thumbnail not found at expected location: ${tempThumbnailPath}`);
                        }
                    }
                    
                    resolve(result);
                } else {
                    reject(new Error('yt-dlp completed but output file not found'));
                }
            });
            
            process.on('error', (error) => {
                logger.error(`[downloadWithYtDlp] yt-dlp error: ${error.message}`);
                reject(new Error(`yt-dlp failed: ${error.message}`));
            });
        });
    } catch (err) {
        logger.error(`[downloadWithYtDlp] Error occurred: ${err.message}`);
        throw new Error(`yt-dlp error: ${err.message}`);
    }
}

/**
 * Download a track from YouTube or Spotify
 * @param {string} url - URL or search query
 * @param {function} progressCallback - Optional progress callback
 * @returns {Promise<{filePath: string, thumbnailPath: string|null, title: string, url: string, artist: string}>}
 */
async function downloadTrack(url, progressCallback = null) {
    try {
        let title = 'Audio';
        let artist = '';
        let originalTitle = '';
        let originalArtist = '';
        
        if (isSpotifyUrl(url)) {
            if (progressCallback) progressCallback({ percent: 0, status: 'resolving' });
            logger.info(`Resolving Spotify link: ${url}`);
            
            // Get structured metadata from Spotify
            const metadata = await getSpotifyMetadata(url);
            logger.info(`[Spotify] Got metadata: "${metadata.title}" by ${metadata.artist}`);
            
            // Store original metadata for verification
            originalTitle = metadata.title;
            originalArtist = metadata.primaryArtist || metadata.artist;
            
            // Search YouTube with verification
            logger.info(`[YouTube] Searching for: ${metadata.searchQuery}`);
            const videoInfo = await searchYouTube(metadata.searchQuery, {
                expectedTitle: metadata.title,
                expectedArtist: metadata.primaryArtist || metadata.artist,
                expectedDuration: metadata.duration
            });
            
            url = videoInfo.url;
            // Use original Spotify title for better consistency
            title = `${originalArtist} - ${originalTitle}`;
            artist = originalArtist;
            
            logger.info(`[Match] Score: ${videoInfo.matchScore}, YouTube title: "${videoInfo.title}"`);
            
        } else if (isYouTubeUrl(url)) {
            if (progressCallback) progressCallback({ percent: 0, status: 'preparing' });
            try {
                // Use cached video info from metadata service to avoid redundant calls
                const { getTrackInfo } = require('./metadata.service');
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

        logger.info(`Downloading: ${title}`);
        logger.info(`Target URL: ${url}`);
        
        const outputPath = config.getOutputPath(title);

        // Download using yt-dlp (pass title for thumbnail organization)
        const downloadResult = await downloadWithYtDlp(url, outputPath, title, progressCallback);
        
        if (!fs.existsSync(downloadResult.audioPath)) {
            throw new Error('Output file not found after download');
        }

        return {
            filePath: downloadResult.audioPath,
            thumbnailPath: downloadResult.thumbnailPath || null,
            title: title,
            artist: artist,
            url: url
        };

    } catch (error) {
        logger.error('Download failed:', error.message || error);
        if (progressCallback) progressCallback({ percent: 0, status: 'error', error: error.message });
        throw error;
    }
}

module.exports = {
    downloadTrack,
    clearCaches
};
