const dbService = require('../../infrastructure/database/db.service');
const priorityService = require('../user/priority.service');
const { logger } = require('../../utils/logger.util');
const { eventBus, QUEUE_ITEM_ADDED, QUEUE_ITEM_REMOVED, QUEUE_REORDERED, QUEUE_CLEARED, QUEUE_UPDATED } = require('../../events');

class QueueManager {
    constructor() {
        this.queue = [];
        this.queueItemIds = new Map(); // Map position -> queue_item_id for database updates
        this._queueLoaded = false;
        // Don't load queue in constructor - wait until database is initialized
        // Queue will be loaded lazily on first access or explicitly via loadQueue()
    }

    loadQueue() {
        if (this._queueLoaded) {
            return; // Already loaded
        }

        try {
            // Load queue items from database
            const dbItems = dbService.getQueueItems();
            const path = require('path');

            this.queue = dbItems.map(item => {
                const content = item.content;
                const sourceUrl = item.source_url;

                // Determine type based on content format (avoid blocking I/O checks)
                // File existence will be validated lazily at playback time
                let type = 'file';

                if (content) {
                    if (content.startsWith('http://') || content.startsWith('https://')) {
                        // Content is a URL
                        type = 'url';
                    } else {
                        // Assume it's a file path - existence will be checked at playback time
                        const isFilePath = content.includes(path.sep) || content.startsWith('/');
                        type = isFilePath ? 'file' : 'url';
                    }
                }

                return {
                    id: item.id,
                    songId: item.song_id, // Store song_id for updating song record
                    content: content,
                    sourceUrl: sourceUrl,
                    type: type,
                    title: item.title,
                    artist: item.artist,
                    channel: item.channel,
                    requester: item.requester_name,
                    sender: item.sender_id || item.requester_whatsapp_id,
                    remoteJid: item.group_id,
                    isPriority: item.is_priority === 1,
                    downloadStatus: item.download_status,
                    downloadProgress: item.download_progress,
                    downloading: item.download_status === 'downloading',
                    thumbnail: item.thumbnail_path,
                    thumbnailUrl: item.thumbnail_url,
                    prefetched: item.prefetched === 1,
                    duration: item.duration
                };
            });

            // Store mapping of position to queue item ID
            this.queueItemIds.clear();
            this.queue.forEach((item, index) => {
                if (item.id) {
                    this.queueItemIds.set(index, item.id);
                }
            });

            this._queueLoaded = true;

            // Defer file existence validation to background task (non-blocking)
            this._validateQueueFilesAsync().catch(err => {
                logger.debug('Background queue file validation error:', err.message);
            });
        } catch (e) {
            // If database isn't ready yet, that's okay - will retry later
            if (e.message && e.message.includes('not initialized')) {
                // Database not ready yet, queue will be loaded later
                return;
            }
            console.error('Failed to load queue:', e);
        }
    }

    /**
     * Asynchronously validate file existence for queue items (background task)
     * Marks items for re-download if file is missing but source URL is available
     */
    async _validateQueueFilesAsync() {
        const fs = require('fs').promises;

        for (const item of this.queue) {
            if (item.type === 'file' && item.content && item.sourceUrl) {
                try {
                    await fs.access(item.content);
                    // File exists, no action needed
                } catch (err) {
                    // File doesn't exist - mark for re-download
                    logger.warn(`Queue item "${item.title}" has missing file, marking for re-download`);
                    item.type = 'url';
                    item.content = item.sourceUrl;
                    item.downloadStatus = 'pending';
                    item.downloadProgress = 0;
                    item.prefetched = false;
                }
            }
        }
    }

    saveQueue(emitUpdate = false) {
        try {
            // Save queue items to database (positions are already updated in add/remove/reorder)
            // Note: Playback state is now managed by PlaybackController, not QueueManager
            
            // Update download progress for items that have changed
            // This is important for prefetch/download progress to be persisted
            this.queue.forEach((item, index) => {
                if (item.id && (item.downloadProgress !== undefined || item.downloadStatus !== undefined || item.prefetched !== undefined || item.downloading !== undefined)) {
                    try {
                        // Sync downloading flag based on downloadStatus if not explicitly set
                        if (item.downloading === undefined && item.downloadStatus) {
                            item.downloading = item.downloadStatus === 'downloading';
                        }
                        
                        dbService.updateQueueItemProgress(
                            item.id,
                            item.downloadProgress || 0,
                            item.downloadStatus || 'pending',
                            item.prefetched || false
                        );
                    } catch (e) {
                        logger.warn(`Failed to update progress for queue item ${item.id}:`, e.message);
                    }
                }
            });

            // Emit update event if requested (for real-time UI updates during downloads)
            if (emitUpdate) {
                eventBus.emit(QUEUE_UPDATED);
            }
        } catch (e) {
            console.error('Failed to save queue:', e);
        }
    }

    checkPriority(sender) {
        return priorityService.checkPriority(sender);
    }

    add(song) {
        const queueLogger = logger.child({ component: 'queue' });
        
        // Check for duplicate URL in queue
        if (song.content && song.type === 'url') {
            const existingIndex = this.queue.findIndex(item =>
                item.content === song.content && item.type === 'url'
            );

            if (existingIndex !== -1) {
                const existingSong = this.queue[existingIndex];
                queueLogger.warn({
                    context: {
                        event: 'duplicate_song_skipped',
                        songTitle: song.title || song.content,
                        existingPosition: existingIndex + 1,
                        existingTitle: existingSong.title || existingSong.content,
                        source: song.content
                    }
                }, `Skipping duplicate song: "${song.title || song.content}"`);
                return null; // Return null to indicate the song was not added (duplicate)
            }
        }

        const isPriority = this.checkPriority(song.sender);
        song.isPriority = isPriority;

        let insertIndex = this.queue.length;
        if (isPriority && this.queue.length > 0) {
            // Find the first non-priority item to insert before it
            for (let i = 0; i < this.queue.length; i++) {
                if (!this.queue[i].isPriority) {
                    insertIndex = i;
                    break;
                }
            }
        }

        // Determine source URL: if content is a URL, use it as source_url
        // Otherwise, if song has sourceUrl property, use that
        const sourceUrl = (song.content && (song.content.startsWith('http://') || song.content.startsWith('https://')))
            ? song.content
            : (song.sourceUrl || null);

        // Add to database
        const queueItemId = dbService.addQueueItem({
            content: song.content,
            title: song.title || 'Unknown',
            artist: song.artist || null,
            channel: song.channel || null,
            duration: song.duration || null,
            thumbnail_path: song.thumbnail || null,
            thumbnail_url: song.thumbnailUrl || null,
            source_url: sourceUrl,
            requester: song.requester || song.sender || 'Unknown',
            sender_id: song.sender || song.remoteJid || null,
            group_id: song.remoteJid || null,
            is_priority: isPriority,
            download_status: song.downloadStatus || 'pending',
            download_progress: song.downloadProgress || 0,
            prefetched: song.prefetched || false,
            position: insertIndex
        });

        // Add to in-memory queue
        const queueItem = {
            id: queueItemId,
            ...song,
            isPriority
        };
        this.queue.splice(insertIndex, 0, queueItem);

        // Update position mappings incrementally instead of rebuilding entire map
        // Shift positions for items at insertIndex and after
        for (let i = this.queue.length - 1; i > insertIndex; i--) {
            const prevId = this.queueItemIds.get(i - 1);
            if (prevId) {
                this.queueItemIds.set(i, prevId);
            }
        }
        // Set the new item's position
        this.queueItemIds.set(insertIndex, queueItemId);

        this.saveQueue();
        eventBus.emit(QUEUE_UPDATED);
        eventBus.emit(QUEUE_ITEM_ADDED, { item: queueItem });

        queueLogger.info({
            context: {
                event: 'queue_item_added',
                songTitle: song.title || song.content,
                songId: queueItemId,
                position: insertIndex + 1,
                queueSize: this.queue.length,
                isPriority,
                requester: song.sender || song.requester,
                source: song.type,
                sourceUrl: song.content
            }
        }, `Added to queue: "${song.title || song.content}"`);

        return queueItem; // Return the added item on success
    }

    remove(index) {
        const queueLogger = logger.child({ component: 'queue' });
        
        if (index >= 0 && index < this.queue.length) {
            const item = this.queue[index];
            const itemId = this.queueItemIds.get(index);
            if (itemId) {
                dbService.removeQueueItem(itemId);
            }

            const removed = this.queue.splice(index, 1);

            // Update positions incrementally: shift items after removed index down by 1
            for (let i = index; i < this.queue.length; i++) {
                const nextId = this.queueItemIds.get(i + 1);
                if (nextId) {
                    this.queueItemIds.set(i, nextId);
                }
            }
            // Delete the last position (which is now empty after shifting)
            this.queueItemIds.delete(this.queue.length);

            this.saveQueue();
            eventBus.emit(QUEUE_UPDATED);
            eventBus.emit(QUEUE_ITEM_REMOVED, { index, item: removed[0] });
            
            queueLogger.info({
                context: {
                    event: 'queue_item_removed',
                    songTitle: item.title || item.content,
                    songId: item.id,
                    position: index + 1,
                    queueSize: this.queue.length
                }
            }, `Removed from queue: "${item.title || item.content}"`);
            
            return removed[0];
        }
        return null;
    }

    removeById(itemId) {
        const index = this.queue.findIndex(item => item.id === itemId);
        if (index !== -1) {
            return this.remove(index);
        }
        return null;
    }

    reorder(fromIndex, toIndex) {
        const queueLogger = logger.child({ component: 'queue' });
        
        if (fromIndex >= 0 && fromIndex < this.queue.length &&
            toIndex >= 0 && toIndex < this.queue.length) {
            const item = this.queue[fromIndex];
            
            // Reorder in database
            dbService.reorderQueue(fromIndex, toIndex);

            // Reorder in memory
            const [movedItem] = this.queue.splice(fromIndex, 1);
            this.queue.splice(toIndex, 0, movedItem);

            // Update position mappings incrementally
            const movedId = movedItem.id;
            if (fromIndex < toIndex) {
                // Moving down: shift items between fromIndex and toIndex
                for (let i = fromIndex; i < toIndex; i++) {
                    const nextId = this.queueItemIds.get(i + 1);
                    if (nextId) {
                        this.queueItemIds.set(i, nextId);
                    }
                }
            } else {
                // Moving up: shift items between toIndex and fromIndex
                for (let i = fromIndex; i > toIndex; i--) {
                    const prevId = this.queueItemIds.get(i - 1);
                    if (prevId) {
                        this.queueItemIds.set(i, prevId);
                    }
                }
            }
            // Set moved item to its new position
            this.queueItemIds.set(toIndex, movedId);

            this.saveQueue();
            eventBus.emit(QUEUE_UPDATED);
            eventBus.emit(QUEUE_REORDERED, { fromIndex, toIndex });
            
            queueLogger.info({
                context: {
                    event: 'queue_reordered',
                    songTitle: item.title || item.content,
                    songId: item.id,
                    fromPosition: fromIndex + 1,
                    toPosition: toIndex + 1
                }
            }, `Reordered queue: "${item.title || item.content}" from position ${fromIndex + 1} to ${toIndex + 1}`);
            
            return true;
        }
        return false;
    }

    getQueue() {
        // Lazy load queue if not loaded yet
        if (!this._queueLoaded) {
            this.loadQueue();
        }
        return this.queue;
    }

    clear() {
        const queueLogger = logger.child({ component: 'queue' });
        const clearedCount = this.queue.length;
        
        dbService.clearQueue();
        this.queue = [];
        this.queueItemIds.clear();
        this.saveQueue();
        eventBus.emit(QUEUE_UPDATED);
        eventBus.emit(QUEUE_CLEARED);
        
        queueLogger.info({
            context: {
                event: 'queue_cleared',
                itemsCleared: clearedCount
            }
        }, `Queue cleared (${clearedCount} items removed)`);

        // Clear caches when queue is cleared
        try {
            const { clearCaches } = require('../audio/download.service');
            const { clearVideoInfoCache } = require('../metadata/metadata.service');
            const { clearSearchCache } = require('../youtube/search.service');
            clearCaches();
            clearVideoInfoCache();
            clearSearchCache();
        } catch (e) {
            // Ignore errors if modules aren't loaded yet
        }
    }

    /**
     * Remove playing item with smart fallback logic
     * Tries ID-based removal first, falls back to index-based
     * @param {Object} item - Queue item to remove
     * @param {number} itemIndex - Optional index hint
     * @returns {Object|null} Removed item or null if not found
     */
    removePlayingItem(item, itemIndex = null) {
        if (!item) {
            return null;
        }

        // Prefer ID-based removal for robustness
        if (item.id) {
            const removed = this.removeById(item.id);
            if (removed) {
                return removed;
            }
            // If ID removal failed, fall back to index-based
        }

        // Fallback to index-based removal
        if (itemIndex !== null && itemIndex >= 0 && itemIndex < this.queue.length) {
            return this.remove(itemIndex);
        } else if (this.queue.length > 0) {
            return this.remove(0);
        }

        return null;
    }

    /**
     * Add a song to the front of the queue (position 0)
     * @param {Object} song - Song object to add
     * @returns {Object|null} The added queue item or null if failed
     */
    addFirst(song) {
        const queueLogger = logger.child({ component: 'queue' });

        // Check for duplicate URL in queue
        if (song.content && song.type === 'url') {
            const existingIndex = this.queue.findIndex(item =>
                item.content === song.content && item.type === 'url'
            );

            if (existingIndex !== -1) {
                // If already in queue, move to front
                return this.move(existingIndex, 0);
            }
        }

        // Determine source URL
        const sourceUrl = (song.content && (song.content.startsWith('http://') || song.content.startsWith('https://')))
            ? song.content
            : (song.sourceUrl || null);

        // Add to database at position 0
        const queueItemId = dbService.addQueueItem({
            content: song.content,
            title: song.title || 'Unknown',
            artist: song.artist || null,
            channel: song.channel || null,
            duration: song.duration || null,
            thumbnail_path: song.thumbnail || null,
            thumbnail_url: song.thumbnailUrl || null,
            source_url: sourceUrl,
            requester: song.requester || song.sender || 'Unknown',
            sender_id: song.sender || song.remoteJid || null,
            group_id: song.remoteJid || null,
            is_priority: song.isPriority || false,
            download_status: song.downloadStatus || 'pending',
            download_progress: song.downloadProgress || 0,
            prefetched: song.prefetched || false,
            position: 0
        });

        // Add to front of in-memory queue
        const queueItem = {
            id: queueItemId,
            ...song,
        };
        this.queue.unshift(queueItem);

        // Update position mappings - shift all existing items up by 1
        const newMap = new Map();
        newMap.set(0, queueItemId);
        for (const [pos, id] of this.queueItemIds) {
            newMap.set(pos + 1, id);
        }
        this.queueItemIds = newMap;

        this.saveQueue();
        eventBus.emit(QUEUE_UPDATED);
        eventBus.emit(QUEUE_ITEM_ADDED, { item: queueItem });

        queueLogger.info({
            context: {
                event: 'queue_item_added_first',
                songTitle: song.title || song.content,
                songId: queueItemId,
                queueSize: this.queue.length,
            }
        }, `Added to front of queue: "${song.title || song.content}"`);

        return queueItem;
    }

    /**
     * Move a queue item from one position to another
     * @param {number} fromIndex - Current position
     * @param {number} toIndex - Target position
     * @returns {Object|null} The moved item or null if failed
     */
    move(fromIndex, toIndex) {
        const queueLogger = logger.child({ component: 'queue' });

        if (fromIndex < 0 || fromIndex >= this.queue.length ||
            toIndex < 0 || toIndex >= this.queue.length) {
            return null;
        }

        if (fromIndex === toIndex) {
            return this.queue[fromIndex];
        }

        // Remove item from original position
        const [item] = this.queue.splice(fromIndex, 1);

        // Insert at new position
        this.queue.splice(toIndex, 0, item);

        // Rebuild position mappings
        this.queueItemIds.clear();
        this.queue.forEach((queueItem, index) => {
            if (queueItem.id) {
                this.queueItemIds.set(index, queueItem.id);
            }
        });

        this.saveQueue();
        eventBus.emit(QUEUE_UPDATED);
        eventBus.emit(QUEUE_REORDERED, { fromIndex, toIndex, item });

        queueLogger.info({
            context: {
                event: 'queue_item_moved',
                songTitle: item.title || item.content,
                fromPosition: fromIndex + 1,
                toPosition: toIndex + 1,
            }
        }, `Moved queue item: "${item.title || item.content}" from ${fromIndex + 1} to ${toIndex + 1}`);

        return item;
    }
}

module.exports = new QueueManager();
