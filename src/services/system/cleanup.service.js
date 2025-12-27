const { logger } = require('../../utils/logger.util');
const fs = require('fs');

/**
 * Cleanup Service
 *
 * Handles file cleanup operations:
 * - Clean up audio files after playback
 * - Clean up thumbnail files
 * - Respect configuration settings
 */
class CleanupService {
    constructor() {}

    /**
     * Clean up files after playback if configured
     * @param {Object} currentSong - Current song object
     * @param {Object} config - Config object
     */
    cleanupAfterPlayback(currentSong, config) {
        if (!currentSong || !config.playback.cleanupAfterPlay) {
            return;
        }

        // Clean up audio file
        if (currentSong.content) {
            this.cleanupFile(currentSong.content);
        }

        // Clean up thumbnail
        if (currentSong.thumbnail) {
            this.cleanupThumbnail(currentSong.thumbnail);
        }
    }

    /**
     * Clean up a single file safely
     * @param {string} filePath - Path to file to delete
     */
    cleanupFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                logger.debug(`Cleaned up file: ${filePath}`);
            }
        } catch (error) {
            logger.warn(`Failed to clean up file ${filePath}:`, error.message);
        }
    }

    /**
     * Clean up a thumbnail file safely
     * @param {string} thumbnailPath - Path to thumbnail file to delete
     */
    cleanupThumbnail(thumbnailPath) {
        try {
            if (fs.existsSync(thumbnailPath)) {
                fs.unlinkSync(thumbnailPath);
                logger.debug(`Cleaned up thumbnail: ${thumbnailPath}`);
            }
        } catch (error) {
            logger.warn(`Failed to clean up thumbnail ${thumbnailPath}:`, error.message);
        }
    }
}

module.exports = new CleanupService();
