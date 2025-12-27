const services = require('../../services');
const { logger } = require('../../utils/logger.util');
const fs = require('fs');
const helpersUtil = require('../../utils/helpers.util');

/**
 * Queue Controller
 * Handles queue management business logic
 */

class QueueController {
    /**
     * Get queue status
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async getQueue(req, res) {
        try {
            const queue = services.playback.queue.getQueue();
            const currentSong = services.playback.orchestrator.getCurrent();

            // Add thumbnail URLs to queue items
            const addThumbnailUrl = (item) => {
                if (item.thumbnail && fs.existsSync(item.thumbnail)) {
                    const thumbnailUrl = helpersUtil.getThumbnailUrl(item.thumbnail);
                    if (thumbnailUrl) {
                        return { ...item, thumbnailUrl };
                    }
                }
                return item;
            };

            const queueWithThumbnails = queue.map(addThumbnailUrl);

            // Add thumbnail URL to current song if available
            let currentSongWithThumbnail = currentSong;
            if (currentSong && currentSong.thumbnail && fs.existsSync(currentSong.thumbnail)) {
                const thumbnailUrl = helpersUtil.getThumbnailUrl(currentSong.thumbnail);
                if (thumbnailUrl) {
                    currentSongWithThumbnail = { ...currentSong, thumbnailUrl };
                }
            }

            res.json({
                queue: queueWithThumbnails,
                currentSong: currentSongWithThumbnail
            });
        } catch (error) {
            logger.error('[QueueController] Error getting queue:', error);
            res.status(500).json({ error: 'Failed to get queue' });
        }
    }

    /**
     * Add song to queue
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async addSong(req, res) {
        const { url: input, requester } = req.body;

        if (!input) {
            return res.status(400).json({ error: 'URL or search query is required' });
        }

        try {
            // Resolve song using the song resolution service
            const song = await services.playback.songResolution.resolveSong(input, {
                requester: requester || 'Web User',
                remoteJid: 'WEB_DASHBOARD',
                sender: 'WEB_DASHBOARD'
            });

            const result = services.playback.queue.add(song);
            if (result === null) {
                return res.status(409).json({
                    success: false,
                    message: 'Song already in queue',
                    title: song.title,
                    artist: song.artist
                });
            }
            res.json({ success: true, message: 'Song added to queue', title: song.title, artist: song.artist });
        } catch (error) {
            logger.error('[QueueController] Error adding song:', error);
            res.status(400).json({
                error: 'Failed to add song',
                details: error.message
            });
        }
    }

    /**
     * Skip current song
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    skip(req, res) {
        try {
            if (services.playback.orchestrator.skip()) {
                res.json({ success: true, message: 'Skipped current song' });
            } else {
                res.status(400).json({ error: 'Cannot skip (nothing playing)' });
            }
        } catch (error) {
            logger.error('[QueueController] Error skipping song:', error);
            res.status(500).json({ error: 'Failed to skip song' });
        }
    }

    /**
     * Pause current song
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    pause(req, res) {
        try {
            if (services.playback.orchestrator.pause()) {
                res.json({ success: true, message: 'Paused current song' });
            } else {
                res.status(400).json({ error: 'Cannot pause (not playing or already paused)' });
            }
        } catch (error) {
            logger.error('[QueueController] Error pausing song:', error);
            res.status(500).json({ error: 'Failed to pause song' });
        }
    }

    /**
     * Resume current song
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    resume(req, res) {
        try {
            if (services.playback.orchestrator.resume()) {
                res.json({ success: true, message: 'Resumed current song' });
            } else {
                res.status(400).json({ error: 'Cannot resume (not paused or not playing)' });
            }
        } catch (error) {
            logger.error('[QueueController] Error resuming song:', error);
            res.status(500).json({ error: 'Failed to resume song' });
        }
    }

    /**
     * Seek to position in current song
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    seek(req, res) {
        const { time } = req.body;

        if (typeof time !== 'number' || time < 0) {
            return res.status(400).json({ error: 'Valid time (in milliseconds) is required' });
        }

        try {
            if (services.playback.orchestrator.seek(time)) {
                res.json({ success: true, message: `Seeked to ${time}ms` });
            } else {
                res.status(400).json({ error: 'Cannot seek (not playing or no current song)' });
            }
        } catch (error) {
            logger.error('[QueueController] Error seeking:', error);
            res.status(500).json({ error: 'Failed to seek' });
        }
    }

    /**
     * Remove song from queue
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    remove(req, res) {
        const index = parseInt(req.params.index, 10);

        try {
            const removed = services.playback.queue.remove(index);

            if (removed) {
                res.json({ success: true, removed });
            } else {
                res.status(400).json({ error: 'Invalid index' });
            }
        } catch (error) {
            logger.error('[QueueController] Error removing song:', error);
            res.status(500).json({ error: 'Failed to remove song' });
        }
    }

    /**
     * Reorder queue items
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    reorder(req, res) {
        const { fromIndex, toIndex } = req.body;

        if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') {
            return res.status(400).json({ error: 'fromIndex and toIndex are required' });
        }

        try {
            if (services.playback.queue.reorder(fromIndex, toIndex)) {
                res.json({ success: true, message: 'Queue reordered' });
            } else {
                res.status(400).json({ error: 'Invalid indices' });
            }
        } catch (error) {
            logger.error('[QueueController] Error reordering queue:', error);
            res.status(500).json({ error: 'Failed to reorder queue' });
        }
    }

    /**
     * Prefetch all songs in queue
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async prefetch(req, res) {
        try {
            // Trigger prefetch in background (don't wait for it to complete)
            services.playback.prefetch.prefetchAll().catch(err => logger.error('Prefetch error:', err));
            res.json({ success: true, message: 'Prefetch started' });
        } catch (error) {
            logger.error('[QueueController] Error starting prefetch:', error);
            res.status(500).json({ error: 'Failed to start prefetch' });
        }
    }

    /**
     * Start a new session
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    newSession(req, res) {
        try {
            services.playback.queue.clear();
            if (services.playback.orchestrator.resetSession()) {
                res.json({ success: true, message: 'New session started' });
            } else {
                res.status(500).json({ error: 'Failed to start new session' });
            }
        } catch (error) {
            logger.error('[QueueController] Error starting new session:', error);
            res.status(500).json({ error: 'Failed to start new session' });
        }
    }
}

module.exports = new QueueController();
