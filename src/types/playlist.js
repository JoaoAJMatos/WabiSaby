/**
 * Playlist Domain Model
 * Represents a playlist in the system
 */
class Playlist {
    constructor(data = {}) {
        this.id = data.id || '';
        this.name = data.name || '';
        this.source = data.source || null; // 'spotify', 'youtube', etc.
        this.sourceUrl = data.sourceUrl || data.source_url || null;
        this.createdAt = data.createdAt || data.created_at || null;
        this.updatedAt = data.updatedAt || data.updated_at || null;
        this.items = data.items || []; // Array of PlaylistItem objects
    }

    /**
     * Create Playlist from database record
     * @param {Object} dbRecord - Database record
     * @param {Array} items - Playlist items
     * @returns {Playlist} Playlist instance
     */
    static fromDatabase(dbRecord, items = []) {
        return new Playlist({
            id: dbRecord.id,
            name: dbRecord.name,
            source: dbRecord.source,
            sourceUrl: dbRecord.source_url,
            createdAt: dbRecord.created_at,
            updatedAt: dbRecord.updated_at,
            items: items
        });
    }

    /**
     * Convert to database format
     * @returns {Object} Database record format
     */
    toDatabase() {
        return {
            id: this.id,
            name: this.name,
            source: this.source,
            source_url: this.sourceUrl
        };
    }

    /**
     * Convert to JSON format
     * @returns {Object} JSON representation
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            source: this.source,
            sourceUrl: this.sourceUrl,
            itemCount: this.items.length,
            items: this.items.map(item => item.toJSON()),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    /**
     * Validate the playlist
     * @returns {Array} Array of validation errors
     */
    validate() {
        const errors = [];

        if (!this.id) {
            errors.push('ID is required');
        }

        if (!this.name) {
            errors.push('Name is required');
        }

        if (this.name.length > 100) {
            errors.push('Name must be 100 characters or less');
        }

        if (this.source && !['spotify', 'youtube', 'local'].includes(this.source)) {
            errors.push('Source must be "spotify", "youtube", or "local"');
        }

        return errors;
    }

    /**
     * Add an item to the playlist
     * @param {PlaylistItem} item - Item to add
     */
    addItem(item) {
        this.items.push(item);
        this.updatedAt = Date.now();
    }

    /**
     * Remove an item from the playlist
     * @param {number} index - Index of item to remove
     * @returns {PlaylistItem|null} Removed item or null
     */
    removeItem(index) {
        if (index >= 0 && index < this.items.length) {
            const removed = this.items.splice(index, 1)[0];
            this.updatedAt = Date.now();
            return removed;
        }
        return null;
    }

    /**
     * Reorder items in the playlist
     * @param {number} fromIndex - Source index
     * @param {number} toIndex - Destination index
     * @returns {boolean} True if successful
     */
    reorderItems(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.items.length ||
            toIndex < 0 || toIndex >= this.items.length) {
            return false;
        }

        const item = this.items.splice(fromIndex, 1)[0];
        this.items.splice(toIndex, 0, item);
        this.updatedAt = Date.now();
        return true;
    }

    /**
     * Get item count
     * @returns {number} Number of items
     */
    getItemCount() {
        return this.items.length;
    }

    /**
     * Get total duration of all items
     * @returns {number} Total duration in seconds
     */
    getTotalDuration() {
        return this.items.reduce((total, item) => total + (item.duration || 0), 0);
    }

    /**
     * Check if playlist is from external source
     * @returns {boolean} True if from Spotify, YouTube, etc.
     */
    isExternal() {
        return !!this.source && this.source !== 'local';
    }

    /**
     * Get display name
     * @returns {string} Display name with item count
     */
    getDisplayName() {
        return `${this.name} (${this.items.length} tracks)`;
    }
}

/**
 * PlaylistItem Domain Model
 * Represents an item within a playlist
 */
class PlaylistItem {
    constructor(data = {}) {
        this.id = data.id || null;
        this.playlistId = data.playlistId || data.playlist_id || '';
        this.title = data.title || '';
        this.artist = data.artist || '';
        this.url = data.url || '';
        this.searchQuery = data.searchQuery || data.search_query || '';
        this.position = data.position || 0;
        this.duration = data.duration || null;
    }

    /**
     * Create PlaylistItem from database record
     * @param {Object} dbRecord - Database record
     * @returns {PlaylistItem} PlaylistItem instance
     */
    static fromDatabase(dbRecord) {
        return new PlaylistItem({
            id: dbRecord.id,
            playlistId: dbRecord.playlist_id,
            title: dbRecord.title,
            artist: dbRecord.artist,
            url: dbRecord.url,
            searchQuery: dbRecord.search_query,
            position: dbRecord.position,
            duration: dbRecord.duration
        });
    }

    /**
     * Convert to database format
     * @returns {Object} Database record format
     */
    toDatabase() {
        return {
            playlist_id: this.playlistId,
            title: this.title,
            artist: this.artist,
            url: this.url,
            search_query: this.searchQuery,
            position: this.position
        };
    }

    /**
     * Convert to JSON format
     * @returns {Object} JSON representation
     */
    toJSON() {
        return {
            id: this.id,
            title: this.title,
            artist: this.artist,
            url: this.url,
            searchQuery: this.searchQuery,
            position: this.position,
            duration: this.duration
        };
    }

    /**
     * Validate the playlist item
     * @returns {Array} Array of validation errors
     */
    validate() {
        const errors = [];

        if (!this.title) {
            errors.push('Title is required');
        }

        if (!this.playlistId) {
            errors.push('Playlist ID is required');
        }

        if (this.position < 0) {
            errors.push('Position must be non-negative');
        }

        return errors;
    }

    /**
     * Get display name
     * @returns {string} Display name
     */
    getDisplayName() {
        if (this.artist && this.title) {
            return `${this.artist} - ${this.title}`;
        }
        return this.title || 'Unknown Track';
    }
}

module.exports = {
    Playlist,
    PlaylistItem
};
