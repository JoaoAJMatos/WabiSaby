/**
 * Song Domain Model
 * Represents a music track/song in the system
 */
class Song {
    constructor(data = {}) {
        this.id = data.id || null;
        this.content = data.content || ''; // URL or file path
        this.title = data.title || '';
        this.artist = data.artist || '';
        this.channel = data.channel || '';
        this.duration = data.duration || null;
        this.thumbnailPath = data.thumbnailPath || data.thumbnail_path || null;
        this.thumbnailUrl = data.thumbnailUrl || data.thumbnail_url || null;
        this.sourceUrl = data.sourceUrl || data.source_url || null;
        this.volumeGainDb = data.volumeGainDb || data.volume_gain_db || 0;
        this.createdAt = data.createdAt || data.created_at || null;
    }

    /**
     * Create Song from database record
     * @param {Object} dbRecord - Database record
     * @returns {Song} Song instance
     */
    static fromDatabase(dbRecord) {
        return new Song({
            id: dbRecord.id,
            content: dbRecord.content,
            title: dbRecord.title,
            artist: dbRecord.artist,
            channel: dbRecord.channel,
            duration: dbRecord.duration,
            thumbnailPath: dbRecord.thumbnail_path,
            thumbnailUrl: dbRecord.thumbnail_url,
            sourceUrl: dbRecord.source_url,
            volumeGainDb: dbRecord.volume_gain_db || 0,
            createdAt: dbRecord.created_at
        });
    }

    /**
     * Convert to database format
     * @returns {Object} Database record format
     */
    toDatabase() {
        return {
            content: this.content,
            title: this.title,
            artist: this.artist,
            channel: this.channel,
            duration: this.duration,
            thumbnail_path: this.thumbnailPath,
            thumbnail_url: this.thumbnailUrl,
            source_url: this.sourceUrl,
            volume_gain_db: this.volumeGainDb
        };
    }

    /**
     * Convert to JSON format
     * @returns {Object} JSON representation
     */
    toJSON() {
        return {
            id: this.id,
            content: this.content,
            title: this.title,
            artist: this.artist,
            channel: this.channel,
            duration: this.duration,
            thumbnailPath: this.thumbnailPath,
            thumbnailUrl: this.thumbnailUrl,
            sourceUrl: this.sourceUrl,
            volumeGainDb: this.volumeGainDb,
            createdAt: this.createdAt
        };
    }

    /**
     * Validate the song
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

        if (this.duration !== null && (this.duration < 0 || this.duration > 24 * 60 * 60)) {
            errors.push('Duration must be between 0 and 24 hours in seconds');
        }

        if (this.volumeGainDb < -20 || this.volumeGainDb > 20) {
            errors.push('Volume gain must be between -20 and +20 dB');
        }

        return errors;
    }

    /**
     * Check if this song is a duplicate of another song
     * @param {Song} other - Other song to compare
     * @returns {boolean} True if songs are duplicates
     */
    isDuplicate(other) {
        return this.content === other.content;
    }

    /**
     * Get display name for the song
     * @returns {string} Display name
     */
    getDisplayName() {
        if (this.artist && this.title) {
            return `${this.artist} - ${this.title}`;
        }
        return this.title || 'Unknown Track';
    }

    /**
     * Get formatted duration string
     * @returns {string} Formatted duration (e.g., "3:45")
     */
    getFormattedDuration() {
        if (!this.duration) return '';

        const minutes = Math.floor(this.duration / 60);
        const seconds = this.duration % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Set volume gain adjustment
     * @param {number} gainDb - Gain in dB (-20 to +20)
     */
    setVolumeGain(gainDb) {
        if (gainDb >= -20 && gainDb <= 20) {
            this.volumeGainDb = gainDb;
        }
    }

    /**
     * Check if song has volume normalization applied
     * @returns {boolean} True if volume gain is non-zero
     */
    hasVolumeNormalization() {
        return Math.abs(this.volumeGainDb) > 0.1; // Allow small rounding differences
    }

    /**
     * Get the source URL (original URL for re-downloading)
     * @returns {string|null} Source URL or null
     */
    getSourceUrl() {
        return this.sourceUrl || this.content;
    }

    /**
     * Update metadata from external source
     * @param {Object} metadata - Metadata object
     */
    updateMetadata(metadata) {
        if (metadata.title) this.title = metadata.title;
        if (metadata.artist) this.artist = metadata.artist;
        if (metadata.channel) this.channel = metadata.channel;
        if (metadata.duration) this.duration = metadata.duration;
        if (metadata.thumbnailUrl) this.thumbnailUrl = metadata.thumbnailUrl;
        if (metadata.thumbnailPath) this.thumbnailPath = metadata.thumbnailPath;
    }
}

module.exports = Song;
