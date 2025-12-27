const { logger } = require('../../utils/logger.util');
const { downloadTrack } = require('../audio/download.service');
const { getThumbnailUrl } = require('../../utils/helpers.util');
// Direct requires to avoid circular dependencies
const queueService = require('./queue.service');
const statsService = require('../system/stats.service');
const volumeNormalizationService = require('../audio/volume-normalization.service');

/**
 * Download Orchestrator Service
 *
 * Handles all download orchestration concerns:
 * - Orchestrate downloads with progress tracking
 * - Update queue items with download status/progress
 * - Handle database updates for songs (content, metadata, thumbnails)
 * - Trigger volume normalization analysis
 * - Update stats with thumbnails
 * - Manage download state (downloadingUrls tracking)
 */
class DownloadOrchestratorService {
    constructor() {
        this.downloadingUrls = new Set();
    }

    /**
     * Download and prepare a song for playback
     * @param {Object} item - Queue item to download
     * @param {function} progressCallback - Optional progress callback
     * @returns {Promise<{filePath: string, title: string}>} Download result
     */
    async downloadAndPrepare(item, progressCallback = null) {
        const dbService = require('../../infrastructure/database/db.service');

        item.downloadStatus = 'preparing';
        item.downloadProgress = 0;
        item.downloading = true; // Set downloading flag for UI updates
        queueService.saveQueue(true);

        const originalUrl = item.content; // Store original URL before download
        let lastSaveTime = Date.now();
        let lastProgress = 0;
        const SAVE_THROTTLE_MS = 200; // Throttle saves to max once per 200ms

        // Start fetching lyrics in parallel as soon as we have title/artist
        let lyricsPromise = null;
        
        // Set up metadata callback to start lyrics fetch as soon as we get metadata from download
        const metadataCallback = (metadata) => {
            if (item.songId && metadata && metadata.title && !lyricsPromise) {
                lyricsPromise = this.fetchAndStoreLyricsEarly(item.songId, metadata.title, metadata.artist || '')
                    .catch(err => {
                        logger.debug(`[DownloadOrchestrator] Metadata-based lyrics fetch failed (non-blocking): ${err.message}`);
                    });
            }
        };

        // If we already have title/artist, start lyrics fetch immediately
        if (item.title && item.artist && item.songId) {
            lyricsPromise = this.fetchAndStoreLyricsEarly(item.songId, item.title, item.artist)
                .catch(err => {
                    logger.debug(`[DownloadOrchestrator] Early lyrics fetch failed (non-blocking): ${err.message}`);
                });
        }

        // Start download with metadata callback - lyrics will start fetching in parallel as soon as metadata is available
        const result = await downloadTrack(item.content, (progress) => {
            const newProgress = progress.percent || 0;
            item.downloadProgress = newProgress;
            item.downloadStatus = progress.status || 'downloading';
            item.downloading = true; // Ensure downloading flag is set during progress updates

            // Throttle saves to prevent excessive updates, but always save on significant changes
            const now = Date.now();
            const timeSinceLastSave = now - lastSaveTime;
            const progressChange = Math.abs(newProgress - lastProgress);

            // Save if: enough time passed OR significant progress change (>5%)
            if (timeSinceLastSave >= SAVE_THROTTLE_MS || progressChange > 5) {
                queueService.saveQueue(true);
                lastSaveTime = now;
                lastProgress = newProgress;
            }

            // Call external progress callback if provided
            if (progressCallback) {
                progressCallback(progress);
            }
        }, metadataCallback);

        // Update stats with thumbnail
        if (result.thumbnailPath) {
            const thumbnailUrl = getThumbnailUrl(result.thumbnailPath);
            if (thumbnailUrl) {
                statsService.updateLastSong(item.content, { thumbnailUrl });
            }
        }

        // Update song record in database: set content to file path and preserve original URL as source_url
        if (item.songId) {
            this.updateSongRecord(item.songId, {
                content: result.filePath, // Update content to file path
                source_url: originalUrl, // Preserve original URL
                title: result.title,
                artist: result.artist,
                thumbnail_path: result.thumbnailPath,
                thumbnail_url: result.thumbnailPath ? getThumbnailUrl(result.thumbnailPath) : null
            });

            // Fetch lyrics if not already started, or update with duration if we have the file
            if (!lyricsPromise) {
                // Start lyrics fetch now (we have title/artist from download result)
                lyricsPromise = this.fetchAndStoreLyrics(item.songId, result.filePath, result.title, result.artist || item.artist || '')
                    .catch(err => {
                        logger.debug(`[DownloadOrchestrator] Lyrics fetch failed (non-blocking): ${err.message}`);
                    });
            } else {
                // Lyrics fetch already started, but now we can update with duration if needed
                // The early fetch will complete, and if it didn't find lyrics, we can retry with duration
                lyricsPromise.then(() => {
                    // Check if lyrics were stored, if not, retry with duration
                    const dbService = require('../../infrastructure/database/db.service');
                    const existingLyrics = dbService.getSongLyrics(item.songId);
                    if (!existingLyrics) {
                        // Retry with duration for better matching
                        this.fetchAndStoreLyrics(item.songId, result.filePath, result.title, result.artist || item.artist || '')
                            .catch(err => {
                                logger.debug(`[DownloadOrchestrator] Lyrics retry with duration failed: ${err.message}`);
                            });
                    }
                }).catch(() => {
                    // If early fetch failed, try again with duration
                    this.fetchAndStoreLyrics(item.songId, result.filePath, result.title, result.artist || item.artist || '')
                        .catch(err => {
                            logger.debug(`[DownloadOrchestrator] Lyrics retry failed: ${err.message}`);
                        });
                });
            }

            // Analyze audio and store volume gain (async, non-blocking)
            const settings = volumeNormalizationService.getNormalizationSettings();
            if (settings.enabled) {
                volumeNormalizationService.analyzeAndStoreGain(item.songId, result.filePath)
                    .catch(err => {
                        logger.error('Volume normalization analysis failed (non-blocking):', err);
                    });
            }
        }

        // Update queue item
        item.type = 'file';
        item.content = result.filePath;
        item.sourceUrl = originalUrl; // Keep in memory for reference
        item.thumbnail = result.thumbnailPath;
        // Add thumbnail URL if thumbnail exists
        if (result.thumbnailPath) {
            const thumbnailUrl = getThumbnailUrl(result.thumbnailPath);
            if (thumbnailUrl) {
                item.thumbnailUrl = thumbnailUrl;
            }
        }
        item.downloadStatus = 'ready';
        item.downloadProgress = 100;
        item.downloading = false; // Clear downloading flag when complete
        queueService.saveQueue(true);

        return {
            filePath: result.filePath,
            title: result.title,
            artist: result.artist || item.artist || '',
            thumbnailPath: result.thumbnailPath || item.thumbnail || null
        };
    }

    /**
     * Update song record in database
     * @param {number} songId - Song ID
     * @param {Object} updates - Updates to apply
     */
    updateSongRecord(songId, updates) {
        const dbService = require('../../infrastructure/database/db.service');
        dbService.updateSong(songId, updates);
    }

    /**
     * Fetch lyrics early (before download completes) - uses title/artist only
     * @param {number} songId - Song ID
     * @param {string} title - Song title
     * @param {string} artist - Song artist
     */
    async fetchAndStoreLyricsEarly(songId, title, artist) {
        try {
            const lyricsService = require('../content/lyrics.service');

            // Fetch lyrics without duration (faster, can start immediately)
            const lyrics = await lyricsService.getLyrics(title, artist, null, songId);
            
            if (lyrics) {
                // Store lyrics in database
                this.updateSongRecord(songId, { lyrics_data: lyrics });
                logger.info(`[DownloadOrchestrator] ✅ Lyrics fetched early and stored for: "${title}" by ${artist || 'Unknown'}`);
                return true;
            } else {
                logger.debug(`[DownloadOrchestrator] No lyrics found early for: "${title}" by ${artist || 'Unknown'}`);
                return false;
            }
        } catch (err) {
            logger.debug(`[DownloadOrchestrator] Error fetching lyrics early: ${err.message}`);
            return false;
        }
    }

    /**
     * Fetch lyrics and store in database (non-blocking)
     * @param {number} songId - Song ID
     * @param {string} filePath - Audio file path
     * @param {string} title - Song title
     * @param {string} artist - Song artist
     */
    async fetchAndStoreLyrics(songId, filePath, title, artist) {
        try {
            const lyricsService = require('../content/lyrics.service');
            const metadataService = require('../metadata/metadata.service');
            const dbService = require('../../infrastructure/database/db.service');

            // Check if lyrics already exist (from early fetch)
            const existingLyrics = dbService.getSongLyrics(songId);
            if (existingLyrics) {
                logger.debug(`[DownloadOrchestrator] Lyrics already fetched for: "${title}" by ${artist || 'Unknown'}`);
                return;
            }

            // Get duration from audio file
            const durationMs = await metadataService.getAudioDuration(filePath);
            const durationSec = durationMs ? Math.round(durationMs / 1000) : null;

            // Fetch lyrics with duration for better matching
            const lyrics = await lyricsService.getLyrics(title, artist, durationSec, songId);
            
            if (lyrics) {
                // Store lyrics in database
                this.updateSongRecord(songId, { lyrics_data: lyrics });
                logger.info(`[DownloadOrchestrator] ✅ Lyrics fetched and stored for: "${title}" by ${artist || 'Unknown'}`);
            } else {
                logger.debug(`[DownloadOrchestrator] No lyrics found for: "${title}" by ${artist || 'Unknown'}`);
            }
        } catch (err) {
            logger.debug(`[DownloadOrchestrator] Error fetching lyrics: ${err.message}`);
            // Don't throw - lyrics fetch is non-blocking
        }
    }

    /**
     * Check if URL is currently being downloaded
     * @param {string} url - URL to check
     * @returns {boolean} True if downloading
     */
    isDownloading(url) {
        return this.downloadingUrls.has(url);
    }

    /**
     * Mark URL as being downloaded
     * @param {string} url - URL to mark
     */
    markDownloading(url) {
        this.downloadingUrls.add(url);
    }

    /**
     * Remove URL from downloading set
     * @param {string} url - URL to remove
     */
    unmarkDownloading(url) {
        this.downloadingUrls.delete(url);
    }

    /**
     * Get current downloading URLs
     * @returns {Set<string>} Set of downloading URLs
     */
    getDownloadingUrls() {
        return new Set(this.downloadingUrls);
    }
}

module.exports = new DownloadOrchestratorService();
