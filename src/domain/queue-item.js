/**
 * QueueItem Domain Model
 * Represents an item in the music queue
 */
class QueueItem {
    constructor(data = {}) {
        this.id = data.id || null;
        this.songId = data.songId || null;
        this.content = data.content || '';
        this.sourceUrl = data.sourceUrl || null;
        this.type = data.type || 'url'; // 'url' or 'file'
        this.title = data.title || '';
        this.artist = data.artist || '';
        this.channel = data.channel || '';
        this.requester = data.requester || '';
        this.sender = data.sender || '';
        this.remoteJid = data.remoteJid || '';
        this.isPriority = data.isPriority || false;
        this.downloadStatus = data.downloadStatus || 'pending';
        this.downloadProgress = data.downloadProgress || 0;
        this.downloading = data.downloading || false;
        this.thumbnail = data.thumbnail || null;
        this.thumbnailUrl = data.thumbnailUrl || null;
        this.prefetched = data.prefetched || false;
        this.duration = data.duration || null;
    }

    /**
     * Create QueueItem from database record
     * @param {Object} dbRecord - Database record
     * @returns {QueueItem} QueueItem instance
     */
    static fromDatabase(dbRecord) {
        return new QueueItem({
            id: dbRecord.id,
            songId: dbRecord.song_id,
            content: dbRecord.content,
            sourceUrl: dbRecord.source_url,
            type: dbRecord.type || 'url',
            title: dbRecord.title,
            artist: dbRecord.artist,
            channel: dbRecord.channel,
            requester: dbRecord.requester_name,
            sender: dbRecord.sender_id || dbRecord.requester_whatsapp_id,
            remoteJid: dbRecord.group_id,
            isPriority: dbRecord.is_priority === 1,
            downloadStatus: dbRecord.download_status,
            downloadProgress: dbRecord.download_progress,
            downloading: dbRecord.download_status === 'downloading',
            thumbnail: dbRecord.thumbnail_path,
            thumbnailUrl: dbRecord.thumbnail_url,
            prefetched: dbRecord.prefetched === 1,
            duration: dbRecord.duration
        });
    }

    /**
     * Convert to database format
     * @returns {Object} Database record format
     */
    toDatabase() {
        return {
            content: this.content,
            title: this.title || 'Unknown',
            artist: this.artist || null,
            channel: this.channel || null,
            duration: this.duration || null,
            thumbnail_path: this.thumbnail || null,
            thumbnail_url: this.thumbnailUrl || null,
            source_url: this.sourceUrl,
            requester: this.requester || this.sender || 'Unknown',
            sender_id: this.sender || this.remoteJid || null,
            group_id: this.remoteJid || null,
            is_priority: this.isPriority,
            download_status: this.downloadStatus || 'pending',
            download_progress: this.downloadProgress || 0,
            prefetched: this.prefetched || false
        };
    }

    /**
     * Convert to JSON format
     * @returns {Object} JSON representation
     */
    toJSON() {
        return {
            id: this.id,
            songId: this.songId,
            content: this.content,
            sourceUrl: this.sourceUrl,
            type: this.type,
            title: this.title,
            artist: this.artist,
            channel: this.channel,
            requester: this.requester,
            sender: this.sender,
            remoteJid: this.remoteJid,
            isPriority: this.isPriority,
            downloadStatus: this.downloadStatus,
            downloadProgress: this.downloadProgress,
            downloading: this.downloading,
            thumbnail: this.thumbnail,
            thumbnailUrl: this.thumbnailUrl,
            prefetched: this.prefetched,
            duration: this.duration
        };
    }

    /**
     * Validate the queue item
     * @returns {Array} Array of validation errors
     */
    validate() {
        const errors = [];

        if (!this.content) {
            errors.push('Content is required');
        }

        if (!this.title) {
            errors.push('Title is required');
        }

        if (!this.requester && !this.sender) {
            errors.push('Requester or sender is required');
        }

        if (!['url', 'file'].includes(this.type)) {
            errors.push('Type must be "url" or "file"');
        }

        return errors;
    }

    /**
     * Check if this item is a duplicate of another item
     * @param {QueueItem} other - Other queue item to compare
     * @returns {boolean} True if items are duplicates
     */
    isDuplicate(other) {
        if (this.type !== other.type) return false;
        if (this.type === 'url' && this.content === other.content) return true;
        return false;
    }

    /**
     * Get display name for the item
     * @returns {string} Display name
     */
    getDisplayName() {
        if (this.title && this.artist) {
            return `${this.artist} - ${this.title}`;
        }
        return this.title || this.content || 'Unknown Track';
    }
}

module.exports = QueueItem;
