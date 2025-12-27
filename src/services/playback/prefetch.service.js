const { logger } = require('../../utils/logger.util');
const config = require('../../config');
const { downloadTrack } = require('../audio/download.service');
const { isRateLimitError } = require('../../utils/rate-limit.util');
const { getThumbnailUrl } = require('../../utils/helpers.util');
// Direct requires to avoid circular dependencies
const queueService = require('./queue.service');
const downloadOrchestratorService = require('./download-orchestrator.service');

/**
 * Prefetch Service
 *
 * Handles prefetching logic separately:
 * - Manage prefetch state (isPrefetching, downloadingUrls, rate limiting)
 * - Prefetch queue items in background
 * - Handle prefetch progress and errors
 * - Rate limit management for prefetches
 */
class PrefetchService {
    constructor() {
        // Prefetch state (operational, not persisted)
        this.isPrefetching = false;
        this.prefetchRateLimitDelay = 2000;
        this.lastPrefetchTime = 0;
        this.MAX_CONCURRENT_PREFETCHES = 2;
        this.activePrefetchCount = 0;
    }

    /**
     * Prefetch next songs in queue
     * @param {number} count - Number of songs to prefetch (0 = all)
     */
    async prefetchNext(count = null) {
        if (!config.performance.prefetchNext) return;

        // Prevent concurrent prefetching calls
        if (this.isPrefetching) {
            logger.debug('Prefetch already in progress, skipping');
            return;
        }

        if (count === null) count = config.performance.prefetchCount;

        const queue = queueService.getQueue();
        if (queue.length === 0) return;

        // Filter to only songs that need prefetching
        const { isFilePath } = require('../../utils/url.util');
        const itemsNeedingPrefetch = queue.filter(item => {
            if (item.type !== 'url') return false;
            // Skip if content is actually a file path (not a URL)
            if (isFilePath(item.content)) {
                logger.debug(`Skipping prefetch for file path: ${item.title || item.content}`);
                return false;
            }
            if (item.prefetched) return false;
            if (item.downloading) return false;
            if (downloadOrchestratorService.isDownloading(item.content)) {
                logger.debug(`Skipping duplicate download for: ${item.title || item.content}`);
                return false;
            }
            return true;
        });

        if (itemsNeedingPrefetch.length === 0) {
            logger.debug('No songs need prefetching');
            return;
        }

        const itemsToPrefetch = count === 0 ? itemsNeedingPrefetch.length : Math.min(count, itemsNeedingPrefetch.length);

        logger.info(`Prefetching ${itemsToPrefetch} song(s) from ${itemsNeedingPrefetch.length} that need prefetching (total queue: ${queue.length})`);

        this.isPrefetching = true;

        let prefetchedCount = 0;
        let failedCount = 0;

        // Process items sequentially with delays
        for (let i = 0; i < itemsToPrefetch; i++) {
            // Wait if we have too many concurrent prefetches
            while (this.activePrefetchCount >= this.MAX_CONCURRENT_PREFETCHES) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Rate limiting
            const timeSinceLastPrefetch = Date.now() - this.lastPrefetchTime;
            if (timeSinceLastPrefetch < this.prefetchRateLimitDelay && i > 0) {
                const waitTime = this.prefetchRateLimitDelay - timeSinceLastPrefetch;
                logger.debug(`Rate limiting: waiting ${waitTime}ms before next prefetch`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            const item = itemsNeedingPrefetch[i];
            const originalUrl = item.content;

            // Skip if URL is already being downloaded
            // Note: This check-and-add pattern is safe in JavaScript because execution is single-threaded.
            // The check and add happen atomically within this synchronous block, with no await points
            // between them, so there's no race condition risk.
            if (downloadOrchestratorService.isDownloading(originalUrl)) {
                logger.debug(`Skipping duplicate download (already in progress): ${item.title || originalUrl}`);
                continue;
            }

            // Mark URL as being downloaded (immediately after check, no await points between)
            downloadOrchestratorService.markDownloading(originalUrl);
            this.activePrefetchCount++;
            this.lastPrefetchTime = Date.now();

            // Start prefetching (don't await - let it run in background)
            (async () => {
                logger.info(`Prefetching song #${i + 1}/${itemsToPrefetch}: ${item.title || item.content}`);
                item.downloadStatus = 'preparing';
                item.downloadProgress = 0;
                item.downloading = true;
                queueService.saveQueue(true);

                try {
                    let lastSaveTime = Date.now();
                    let lastProgress = 0;
                    const SAVE_THROTTLE_MS = 200; // Throttle saves to max once per 200ms

                    const result = await downloadTrack(originalUrl, (progress) => {
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
                    });

                    // Update song record in database: set content to file path and preserve original URL as source_url
                    if (item.songId) {
                        downloadOrchestratorService.updateSongRecord(item.songId, {
                            content: result.filePath, // Update content to file path
                            source_url: originalUrl, // Preserve original URL
                            title: result.title,
                            artist: result.artist,
                            thumbnail_path: result.thumbnailPath,
                            thumbnail_url: result.thumbnailPath ? getThumbnailUrl(result.thumbnailPath) : null
                        });
                    }

                    // Update queue item in memory
                    item.type = 'file';
                    item.content = result.filePath;
                    item.sourceUrl = originalUrl; // Keep in memory for reference
                    item.title = result.title;
                    item.thumbnail = result.thumbnailPath;
                    // Add thumbnail URL if thumbnail exists
                    if (result.thumbnailPath) {
                        const thumbnailUrl = getThumbnailUrl(result.thumbnailPath);
                        if (thumbnailUrl) {
                            item.thumbnailUrl = thumbnailUrl;
                        }
                    }
                    item.prefetched = true;
                    item.downloading = false;
                    item.downloadStatus = 'ready';
                    item.downloadProgress = 100;
                    logger.info(`✓ Prefetch complete for: ${item.title}`);
                    
                    // Save queue (this emits QUEUE_UPDATED internally)
                    queueService.saveQueue(true);
                    
                    prefetchedCount++;

                    // On success, slightly reduce delay
                    this.prefetchRateLimitDelay = Math.max(1000, this.prefetchRateLimitDelay - 100);
                } catch (err) {
                    const errorMsg = err?.message || String(err) || 'Unknown error';
                    logger.error(`✗ Prefetch failed for ${item.title || originalUrl}:`, errorMsg);
                    
                    // Check if this is a "No results found on YouTube" error
                    // If so, remove the item from the queue to prevent it from being retried
                    const isYouTubeNotFoundError = errorMsg.includes('No results found on YouTube');
                    
                    if (isYouTubeNotFoundError) {
                        logger.warn(`Removing song from queue (prefetch): "${item.title || originalUrl}" - No results found on YouTube`);
                        
                        // Remove the item from the queue
                        if (item.id) {
                            queueService.removeById(item.id);
                        } else {
                            // Fallback: find and remove by content
                            const queue = queueService.getQueue();
                            const indexToRemove = queue.findIndex(qItem => 
                                qItem.content === originalUrl && qItem.type === 'url'
                            );
                            if (indexToRemove !== -1) {
                                queueService.remove(indexToRemove);
                            }
                        }
                    } else {
                        // Only update status if we're not removing the item
                        item.downloading = false;
                        item.downloadStatus = 'error';
                        item.downloadProgress = 0;
                        queueService.saveQueue(true);
                    }
                    
                    failedCount++;

                    // On rate limit error, increase delay significantly
                    if (isRateLimitError(err)) {
                        this.prefetchRateLimitDelay = Math.min(10000, this.prefetchRateLimitDelay * 2);
                        logger.warn(`Rate limited during prefetch. Increasing delay to ${this.prefetchRateLimitDelay}ms`);
                    } else {
                        this.prefetchRateLimitDelay = Math.min(5000, this.prefetchRateLimitDelay + 500);
                    }
                } finally {
                    downloadOrchestratorService.unmarkDownloading(originalUrl);
                    this.activePrefetchCount--;
                }
            })().catch(err => {
                // Catch any unhandled errors in the async IIFE
                logger.error(`Unhandled prefetch error for ${item.title || originalUrl}:`, err);
                // Clean up on error
                downloadOrchestratorService.unmarkDownloading(originalUrl);
                this.activePrefetchCount--;
                item.downloading = false;
                item.downloadStatus = 'error';
                item.downloadProgress = 0;
                queueService.saveQueue(true);
                failedCount++;
            });

            // Small delay between starting prefetches
            if (i < itemsToPrefetch - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Wait a bit for prefetches to complete
        await new Promise(resolve => setTimeout(resolve, 2000));

        logger.info(`Prefetch batch started: ${prefetchedCount} completed, ${failedCount} failed, ${this.activePrefetchCount} still active`);

        this.isPrefetching = false;
    }

    /**
     * Prefetch all songs in queue
     */
    async prefetchAll() {
        logger.info('Starting prefetch for all queued songs...');
        await this.prefetchNext(0);
    }

    /**
     * Check if prefetch is currently in progress
     * @returns {boolean} True if prefetching
     */
    isPrefetchingNow() {
        return this.isPrefetching;
    }

    /**
     * Get prefetch state
     * @returns {Object} Current prefetch state
     */
    getPrefetchState() {
        return {
            isPrefetching: this.isPrefetching,
            activeCount: this.activePrefetchCount,
            rateLimitDelay: this.prefetchRateLimitDelay,
            lastPrefetchTime: this.lastPrefetchTime
        };
    }
}

module.exports = new PrefetchService();
