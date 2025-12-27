const services = require('../../services');

/**
 * Stats Controller
 * Handles statistics endpoints
 */

class StatsController {
    /**
     * Get all statistics
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getStats(req, res) {
        try {
            const stats = services.system.stats.getStats();
            const queue = services.playback.queue.getQueue();

            res.json({
                uptime: stats.uptime,
                songsPlayed: stats.songsPlayed,
                queueLength: queue.length,
                requesters: stats.requesters,
                historyCount: stats.history.length,
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get stats' });
        }
    }

    /**
     * Get detailed overview statistics
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getOverview(req, res) {
        try {
            const overview = services.system.stats.getOverview();
            const queue = services.playback.queue.getQueue();

            res.json({
                ...overview,
                queueLength: queue.length,
                uptime: services.system.stats.getUptime(),
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get overview' });
        }
    }

    /**
     * Get top artists
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getTopArtists(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const artists = services.system.stats.getTopArtists(limit);
            res.json(artists);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get artists' });
        }
    }

    /**
     * Get top requesters
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getTopRequesters(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 20;
            const requesters = services.system.stats.getTopRequesters(limit);
            res.json(requesters);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get requesters' });
        }
    }

    /**
     * Get recent play history
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getHistory(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 20;
            const history = services.system.stats.getHistory(limit);
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get history' });
        }
    }

    /**
     * Record a played song (called by player when song starts)
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    recordSong(req, res) {
        try {
            const { title, requester, thumbnailUrl, content } = req.body;
            
            if (!title && !content) {
                return res.status(400).json({ error: 'Song title or content required' });
            }
            
            services.system.stats.recordSongPlayed({
                title: title || content,
                content,
                requester: requester || 'Unknown',
                thumbnailUrl,
            });
            
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to record song' });
        }
    }

    /**
     * Reset all statistics
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    resetStats(req, res) {
        try {
            services.system.stats.resetStats();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to reset stats' });
        }
    }

    /**
     * Get raw stats data for debugging
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getDebugStats(req, res) {
        try {
            const stats = services.system.stats.getStats();
            res.json({
                raw: stats,
                computed: {
                    historyCount: stats.history ? stats.history.length : 0,
                    songsWithDuration: stats.history ? stats.history.filter(s => s.duration > 0).length : 0,
                    requestersCount: Object.keys(stats.requesters || {}).length,
                    artistsCount: Object.keys(stats.artists || {}).length,
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get debug stats' });
        }
    }
}

module.exports = new StatsController();

