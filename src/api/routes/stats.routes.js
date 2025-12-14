const express = require('express');
const router = express.Router();
const statsService = require('../../services/stats.service');
const queueManager = require('../../core/queue');

/**
 * GET /api/stats
 * Get all statistics
 */
router.get('/', (req, res) => {
    try {
        const stats = statsService.getStats();
        const queue = queueManager.getQueue();
        
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
});

/**
 * GET /api/stats/overview
 * Get detailed overview statistics
 */
router.get('/overview', (req, res) => {
    try {
        const overview = statsService.getOverview();
        const queue = queueManager.getQueue();
        
        res.json({
            ...overview,
            queueLength: queue.length,
            uptime: statsService.getUptime(),
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get overview' });
    }
});

/**
 * GET /api/stats/artists
 * Get top artists
 */
router.get('/artists', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const artists = statsService.getTopArtists(limit);
        res.json(artists);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get artists' });
    }
});

/**
 * GET /api/stats/requesters
 * Get top requesters
 */
router.get('/requesters', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const requesters = statsService.getTopRequesters(limit);
        res.json(requesters);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get requesters' });
    }
});

/**
 * GET /api/stats/history
 * Get recent play history
 */
router.get('/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const history = statsService.getHistory(limit);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get history' });
    }
});

/**
 * POST /api/stats/record
 * Record a played song (called by player when song starts)
 */
router.post('/record', (req, res) => {
    try {
        const { title, requester, thumbnailUrl, content } = req.body;
        
        if (!title && !content) {
            return res.status(400).json({ error: 'Song title or content required' });
        }
        
        statsService.recordSongPlayed({
            title: title || content,
            content,
            requester: requester || 'Unknown',
            thumbnailUrl,
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to record song' });
    }
});

/**
 * POST /api/stats/reset
 * Reset all statistics
 */
router.post('/reset', (req, res) => {
    try {
        statsService.resetStats();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset stats' });
    }
});

/**
 * GET /api/stats/debug
 * Get raw stats data for debugging
 */
router.get('/debug', (req, res) => {
    try {
        const stats = statsService.getStats();
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
});

module.exports = { router };

