const EventEmitter = require('events');
const dbService = require('../database/db.service');
const { checkPriority } = require('../services/priority.service');
const { QUEUE_ITEM_ADDED, QUEUE_ITEM_REMOVED, QUEUE_REORDERED, QUEUE_CLEARED, QUEUE_UPDATED } = require('./events');

class QueueManager extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.queueItemIds = new Map(); // Map position -> queue_item_id for database updates
        this.loadQueue();
    }

    loadQueue() {
        try {
            // Load queue items from database
            const dbItems = dbService.getQueueItems();
            this.queue = dbItems.map(item => ({
                id: item.id,
                content: item.content,
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
            }));
            
            // Store mapping of position to queue item ID
            this.queueItemIds.clear();
            this.queue.forEach((item, index) => {
                if (item.id) {
                    this.queueItemIds.set(index, item.id);
                }
            });
        } catch (e) {
            console.error('Failed to load queue:', e);
        }
    }

    saveQueue(emitUpdate = false) {
        try {
            // Save queue items to database (positions are already updated in add/remove/reorder)
            // Note: Playback state is now managed by PlaybackController, not QueueManager
            
            // Emit update event if requested (for real-time UI updates during downloads)
            if (emitUpdate) {
                this.emit(QUEUE_UPDATED);
            }
        } catch (e) {
            console.error('Failed to save queue:', e);
        }
    }

    checkPriority(sender) {
        return checkPriority(sender);
    }

    add(song) {
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

        // Add to database
        const queueItemId = dbService.addQueueItem({
            content: song.content,
            title: song.title || 'Unknown',
            artist: song.artist || null,
            channel: song.channel || null,
            duration: song.duration || null,
            thumbnail_path: song.thumbnail || null,
            thumbnail_url: song.thumbnailUrl || null,
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

        // Update positions for items after insertion
        for (let i = insertIndex + 1; i < this.queue.length; i++) {
            const itemId = this.queueItemIds.get(i);
            if (itemId) {
                this.queueItemIds.set(i, itemId);
            }
        }

        this.saveQueue();
        this.emit(QUEUE_UPDATED);
        this.emit(QUEUE_ITEM_ADDED, { item: queueItem });
    }

    remove(index) {
        if (index >= 0 && index < this.queue.length) {
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
            this.emit(QUEUE_UPDATED);
            this.emit(QUEUE_ITEM_REMOVED, { index, item: removed[0] });
            return removed[0];
        }
        return null;
    }

    reorder(fromIndex, toIndex) {
        if (fromIndex >= 0 && fromIndex < this.queue.length && 
            toIndex >= 0 && toIndex < this.queue.length) {
            // Reorder in database
            dbService.reorderQueue(fromIndex, toIndex);
            
            // Reorder in memory
            const [item] = this.queue.splice(fromIndex, 1);
            this.queue.splice(toIndex, 0, item);
            
            // Update position mappings
            this.queueItemIds.clear();
            this.queue.forEach((item, i) => {
                if (item.id) {
                    this.queueItemIds.set(i, item.id);
                }
            });
            
            this.saveQueue();
            this.emit(QUEUE_UPDATED);
            this.emit(QUEUE_REORDERED, { fromIndex, toIndex });
            return true;
        }
        return false;
    }

    getQueue() {
        return this.queue;
    }

    clear() {
        dbService.clearQueue();
        this.queue = [];
        this.queueItemIds.clear();
        this.saveQueue();
        this.emit(QUEUE_UPDATED);
        this.emit(QUEUE_CLEARED);
        
        // Clear caches when queue is cleared
        try {
            const { clearCaches } = require('../services/download.service');
            const { clearVideoInfoCache } = require('../services/metadata.service');
            const { clearSearchCache } = require('../services/search.service');
            clearCaches();
            clearVideoInfoCache();
            clearSearchCache();
        } catch (e) {
            // Ignore errors if modules aren't loaded yet
        }
    }
}

module.exports = new QueueManager();

