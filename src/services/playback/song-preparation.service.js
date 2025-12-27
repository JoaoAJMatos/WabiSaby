const { logger } = require('../../utils/logger.util');
const { getThumbnailUrl } = require('../../utils/helpers.util');
// Direct requires to avoid circular dependencies
const statsService = require('../system/stats.service');
const volumeNormalizationService = require('../audio/volume-normalization.service');
const lyricsService = require('../content/lyrics.service');
const metadataService = require('../metadata/metadata.service');

/**
 * Song Preparation Service
 *
 * Handles song preparation pipeline (single responsibility):
 * - Coordinate: download → metadata → thumbnail → volume analysis → database update
 * - Return prepared song object ready for playback
 * - Handle all post-download operations in one place
 */
class SongPreparationService {
    constructor() {}

    /**
     * Prepare song for playback (complete pipeline)
     * @param {Object} item - Queue item
     * @param {Object} downloadResult - Result from download
     * @param {string} originalUrl - Original URL before download
     * @returns {Object} Prepared song object
     */
    async prepareSong(item, downloadResult, originalUrl) {
        const dbService = require('../../infrastructure/database/db.service');

        // Update stats with thumbnail
        if (downloadResult.thumbnailPath) {
            const thumbnailUrl = getThumbnailUrl(downloadResult.thumbnailPath);
            if (thumbnailUrl) {
                statsService.updateLastSong(item.content, { thumbnailUrl });
            }
        }

        // Update song record in database
        if (item.songId) {
            await this.updateSongMetadata(item.songId, {
                content: downloadResult.filePath,
                source_url: originalUrl,
                title: downloadResult.title,
                artist: downloadResult.artist,
                thumbnail_path: downloadResult.thumbnailPath,
                thumbnail_url: downloadResult.thumbnailPath ? getThumbnailUrl(downloadResult.thumbnailPath) : null
            });

            // Trigger volume normalization analysis
            await this.triggerVolumeAnalysis(item.songId, downloadResult.filePath);
        }

        // Return prepared song object
        const preparedItem = {
            ...item,
            type: 'file',
            content: downloadResult.filePath,
            sourceUrl: originalUrl,
            thumbnail: downloadResult.thumbnailPath,
            downloadStatus: 'ready',
            downloadProgress: 100
        };

        // Add thumbnail URL if thumbnail exists
        if (downloadResult.thumbnailPath) {
            const thumbnailUrl = getThumbnailUrl(downloadResult.thumbnailPath);
            if (thumbnailUrl) {
                preparedItem.thumbnailUrl = thumbnailUrl;
            }
        }

        // Fetch lyrics during preparation (non-blocking)
        this.fetchLyricsAsync(preparedItem, downloadResult.filePath, downloadResult.title, downloadResult.artist || item.artist || '').catch(err => {
            logger.debug(`[SongPreparation] Lyrics fetch failed (non-blocking): ${err.message}`);
        });

        return preparedItem;
    }

    /**
     * Update song metadata in database
     * @param {number} songId - Song ID
     * @param {Object} metadata - Metadata to update
     */
    async updateSongMetadata(songId, metadata) {
        const dbService = require('../../infrastructure/database/db.service');
        dbService.updateSong(songId, metadata);
    }

    /**
     * Trigger volume normalization analysis
     * @param {number} songId - Song ID
     * @param {string} filePath - Audio file path
     */
    async triggerVolumeAnalysis(songId, filePath) {
        try {
            const settings = volumeNormalizationService.getNormalizationSettings();
            if (settings.enabled) {
                volumeNormalizationService.analyzeAndStoreGain(songId, filePath)
                    .catch(err => {
                        logger.error('Volume normalization analysis failed (non-blocking):', err);
                    });
            }
        } catch (err) {
            logger.error('Error triggering volume analysis:', err);
        }
    }

    /**
     * Fetch lyrics asynchronously and attach to prepared item
     * @param {Object} preparedItem - Prepared song item
     * @param {string} filePath - Audio file path
     * @param {string} title - Song title
     * @param {string} artist - Song artist
     */
    async fetchLyricsAsync(preparedItem, filePath, title, artist) {
        try {
            // Get duration from audio file
            const durationMs = await metadataService.getAudioDuration(filePath);
            const durationSec = durationMs ? Math.round(durationMs / 1000) : null;

            // Fetch lyrics
            const lyrics = await lyricsService.getLyrics(title, artist, durationSec);
            
            if (lyrics) {
                // Attach lyrics to prepared item
                preparedItem.lyrics = lyrics;
                logger.info(`[SongPreparation] ✅ Lyrics fetched for: "${title}" by ${artist || 'Unknown'}`);
            } else {
                logger.debug(`[SongPreparation] No lyrics found for: "${title}" by ${artist || 'Unknown'}`);
            }
        } catch (err) {
            logger.debug(`[SongPreparation] Error fetching lyrics: ${err.message}`);
            // Don't throw - lyrics fetch is non-blocking
        }
    }
}

module.exports = new SongPreparationService();
