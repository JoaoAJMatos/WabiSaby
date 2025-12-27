/**
 * Download Configuration
 * Manages download-related settings and path generation
 */

class DownloadConfig {
    constructor(storageConfig) {
        this.storageConfig = storageConfig;

        // Default download configuration
        this.defaults = {
            audioFormat: 'mp3',
            audioQuality: '128k',
            downloadThumbnails: true,
            thumbnailFormat: 'jpg',
            playerClient: 'android',
            maxFilenameLength: 50,
        };
    }

    /**
     * Get download configuration
     * @returns {Object} Download configuration
     */
    getConfig() {
        return { ...this.defaults };
    }

    /**
     * Get output filename for a download
     * @param {string} title - The track title
     * @param {string} extension - File extension (default: mp3)
     * @returns {string} Safe filename with timestamp
     */
    getOutputFilename(title, extension = null) {
        const ext = extension || this.defaults.audioFormat;
        const safeTitle = title
            .replace(/[^a-z0-9]/gi, '_')
            .substring(0, this.defaults.maxFilenameLength);
        return `${safeTitle}_${Date.now()}.${ext}`;
    }

    /**
     * Get full output path for a download
     * @param {string} title - The track title
     * @param {string} extension - File extension (default: mp3)
     * @param {boolean} useTempDir - Whether to use temp directory (default: true)
     * @param {boolean} organizeByDate - Whether to organize by date subdirectories (default: false for temp, true for media)
     * @returns {string} Full path to output file
     */
    getOutputPath(title, extension = null, useTempDir = true, organizeByDate = null) {
        return this.storageConfig.getOutputPath(title, extension, useTempDir, organizeByDate);
    }

    /**
     * Get thumbnail path for a track
     * @param {string} title - The track title
     * @param {string} url - Optional URL for hash-based naming
     * @param {boolean} organizeByDate - Whether to organize by date subdirectories (default: true)
     * @returns {string} Full path to thumbnail file
     */
    getThumbnailPath(title, url = null, organizeByDate = true) {
        return this.storageConfig.getThumbnailPath(title, url, organizeByDate);
    }

    /**
     * Validate download configuration
     * @param {Object} config - Download configuration to validate
     * @returns {Array} Array of validation warnings
     */
    validate(config) {
        const warnings = [];

        // Validate audio quality format
        const validQualityPattern = /^\d+k$/;
        if (!validQualityPattern.test(config.audioQuality)) {
            warnings.push(`Invalid audio quality format: ${config.audioQuality}. Should be like "128k" or "256k". Using default: ${this.defaults.audioQuality}`);
        }

        return warnings;
    }
}

module.exports = DownloadConfig;
