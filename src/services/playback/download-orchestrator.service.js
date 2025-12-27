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
        });

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
