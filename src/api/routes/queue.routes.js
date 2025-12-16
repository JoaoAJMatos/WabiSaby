const express = require('express');
const queueManager = require('../../core/queue');
const { getTrackInfo } = require('../../services/metadata.service');
const { searchYouTube } = require('../../services/search.service');
const { isSpotifyUrl, isYouTubeUrl } = require('../../utils/url.util');
const { logger } = require('../../utils/logger.util');
const { prefetchAll } = require('../../core/player');

const router = express.Router();

/**
 * Queue Routes
 * Handles queue management endpoints
 */

/**
 * Get queue
 * GET /api/queue
 */
router.get('/queue', async (req, res) => {
    const queue = queueManager.getQueue();
    const currentSong = queueManager.getCurrent();
    
    res.json({ 
        queue: queue,
        currentSong 
    });
});

/**
 * Add song to queue
 * POST /api/queue/add
 * Accepts either a URL (YouTube/Spotify) or a search query
 */
router.post('/queue/add', async (req, res) => {
    const { url: input, requester } = req.body;
    
    if (!input) {
        return res.status(400).json({ error: 'URL or search query is required' });
    }

    let url = input;
    let title = '';
    let artist = '';

    try {
        // Check if input is a URL
        if (isSpotifyUrl(input) || isYouTubeUrl(input)) {
            // Resolve info from URL
            const info = await getTrackInfo(input);
            title = info.title;
            artist = info.artist;
        } else {
            // Treat as search query
            logger.info(`[API] Searching for: ${input}`);
            const searchResult = await searchYouTube(input);
            url = searchResult.url;
            title = searchResult.title;
            artist = searchResult.artist;
            logger.info(`[API] Found: ${title} by ${artist} at ${url}`);
        }

        const song = {
            type: 'url',
            content: url,
            title: title,
            artist: artist,
            requester: requester || 'Web User',
            remoteJid: 'WEB_DASHBOARD',
            sender: 'WEB_DASHBOARD'
        };

        queueManager.add(song);
        res.json({ success: true, message: 'Song added to queue', title: title, artist: artist });
    } catch (error) {
        logger.error('[API] Error adding song:', error);
        res.status(400).json({ 
            error: 'Failed to add song', 
            details: error.message 
        });
    }
});

/**
 * Skip current song
 * POST /api/queue/skip
 */
router.post('/queue/skip', (req, res) => {
    queueManager.skip();
    res.json({ success: true, message: 'Skipped current song' });
});

/**
 * Pause current song
 * POST /api/queue/pause
 */
router.post('/queue/pause', (req, res) => {
    if (queueManager.pause()) {
        res.json({ success: true, message: 'Paused current song' });
    } else {
        res.status(400).json({ error: 'Cannot pause (not playing or already paused)' });
    }
});

/**
 * Resume current song
 * POST /api/queue/resume
 */
router.post('/queue/resume', (req, res) => {
    if (queueManager.resume()) {
        res.json({ success: true, message: 'Resumed current song' });
    } else {
        res.status(400).json({ error: 'Cannot resume (not paused or not playing)' });
    }
});

/**
 * Seek to position in current song
 * POST /api/queue/seek
 * Body: { time: number } (time in milliseconds)
 */
router.post('/queue/seek', (req, res) => {
    const { time } = req.body;
    
    if (typeof time !== 'number' || time < 0) {
        return res.status(400).json({ error: 'Valid time (in milliseconds) is required' });
    }
    
    if (queueManager.seek(time)) {
        res.json({ success: true, message: `Seeked to ${time}ms` });
    } else {
        res.status(400).json({ error: 'Cannot seek (not playing or no current song)' });
    }
});

/**
 * Remove song from queue
 * POST /api/queue/remove/:index
 */
router.post('/queue/remove/:index', (req, res) => {
    const index = parseInt(req.params.index, 10);
    const removed = queueManager.remove(index);
    
    if (removed) {
        res.json({ success: true, removed });
    } else {
        res.status(400).json({ error: 'Invalid index' });
    }
});

/**
 * Reorder queue items
 * POST /api/queue/reorder
 * Body: { fromIndex: number, toIndex: number }
 */
router.post('/queue/reorder', (req, res) => {
    const { fromIndex, toIndex } = req.body;
    
    if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') {
        return res.status(400).json({ error: 'fromIndex and toIndex are required' });
    }
    
    if (queueManager.reorder(fromIndex, toIndex)) {
        res.json({ success: true, message: 'Queue reordered' });
    } else {
        res.status(400).json({ error: 'Invalid indices' });
    }
});

/**
 * Prefetch all songs in queue
 * POST /api/queue/prefetch
 */
router.post('/queue/prefetch', async (req, res) => {
    try {
        // Trigger prefetch in background (don't wait for it to complete)
        prefetchAll().catch(err => logger.error('Prefetch error:', err));
        res.json({ success: true, message: 'Prefetch started' });
    } catch (error) {
        logger.error('[API] Error starting prefetch:', error);
        res.status(500).json({ error: 'Failed to start prefetch' });
    }
});


/**
 * Start a new session
 * POST /api/queue/newsession
 * Clears queue and resets session state
 */
router.post('/queue/newsession', (req, res) => {
    if (queueManager.resetSession()) {
        res.json({ success: true, message: 'New session started' });
    } else {
        res.status(500).json({ error: 'Failed to start new session' });
    }
});

module.exports = { router };