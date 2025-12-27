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
            const fs = require('fs');
            const path = require('path');

            this.queue = dbItems.map(item => {
                const content = item.content;
                const sourceUrl = item.source_url;

                // Determine type: if content is a file path, check if it exists
                // If it doesn't exist but we have a source_url, mark for re-download
                let type = 'file';
                let needsRedownload = false;

                if (content) {
                    // Check if content looks like a file path (contains path separators or is in temp dir)
                    const isFilePath = content.includes(path.sep) || content.startsWith('/');

                    if (isFilePath) {
                        // Check if file exists
                        if (!fs.existsSync(content)) {
                            // File doesn't exist - if we have source_url, mark for re-download
                            if (sourceUrl) {
                                type = 'url';
                                needsRedownload = true;
                                logger.warn(`Queue item "${item.title}" has missing file, will re-download from source URL`);
                            } else {
                                logger.warn(`Queue item "${item.title}" has missing file and no source URL available`);
                            }
                        }
                    } else if (content.startsWith('http://') || content.startsWith('https://')) {
                        // Content is a URL
                        type = 'url';
                    }
                }

                return {
                    id: item.id,
                    songId: item.song_id, // Store song_id for updating song record
                    content: needsRedownload ? sourceUrl : content,
                    sourceUrl: sourceUrl,
                    type: type,
                    title: item.title,
                    artist: item.artist,
                    channel: item.channel,
                    requester: item.requester_name,
                    sender: item.sender_id || item.requester_whatsapp_id,
                    remoteJid: item.group_id,
                    isPriority: item.is_priority === 1,
                    downloadStatus: needsRedownload ? 'pending' : item.download_status,
                    downloadProgress: needsRedownload ? 0 : item.download_progress,
                    downloading: needsRedownload ? false : (item.download_status === 'downloading'),
                    thumbnail: item.thumbnail_path,
                    thumbnailUrl: item.thumbnail_url,
                    prefetched: needsRedownload ? false : (item.prefetched === 1),
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
        } catch (e) {
            // If database isn't ready yet, that's okay - will retry later
            if (e.message && e.message.includes('not initialized')) {
                // Database not ready yet, queue will be loaded later
                return;
            }
            console.error('Failed to load queue:', e);
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
        this.queueItemIds.set(insertIndex, queueItemId);

        // Rebuild position mappings after insertion
        this.queueItemIds.clear();
        this.queue.forEach((item, i) => {
            if (item.id) {
                this.queueItemIds.set(i, item.id);
            }
        });

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
            this.queueItemIds.delete(index);

            // Update positions for remaining items
            this.queueItemIds.clear();
            this.queue.forEach((item, i) => {
                if (item.id) {
                    this.queueItemIds.set(i, item.id);
                }
            });

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

            // Update position mappings
            this.queueItemIds.clear();
            this.queue.forEach((item, i) => {
                if (item.id) {
                    this.queueItemIds.set(i, item.id);
                }
            });

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
}

module.exports = new QueueManager();
