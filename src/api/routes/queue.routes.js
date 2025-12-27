const express = require('express');
const queueController = require('../controllers/queue.controller');

const router = express.Router();

/**
 * Queue Routes
 * Handles queue management endpoints
 */

/**
 * Get queue
 * GET /api/queue
 */
router.get('/queue', queueController.getQueue);

/**
 * Add song to queue
 * POST /api/queue/add
 * Accepts either a URL (YouTube/Spotify) or a search query
 */
router.post('/queue/add', queueController.addSong);

/**
 * Skip current song
 * POST /api/queue/skip
 */
router.post('/queue/skip', queueController.skip);

/**
 * Pause current song
 * POST /api/queue/pause
 */
router.post('/queue/pause', queueController.pause);

/**
 * Resume current song
 * POST /api/queue/resume
 */
router.post('/queue/resume', queueController.resume);

/**
 * Seek to position in current song
 * POST /api/queue/seek
 * Body: { time: number } (time in milliseconds)
 */
router.post('/queue/seek', queueController.seek);

/**
 * Remove song from queue
 * POST /api/queue/remove/:index
 */
router.post('/queue/remove/:index', queueController.remove);

/**
 * Reorder queue items
 * POST /api/queue/reorder
 * Body: { fromIndex: number, toIndex: number }
 */
router.post('/queue/reorder', queueController.reorder);

/**
 * Prefetch all songs in queue
 * POST /api/queue/prefetch
 */
router.post('/queue/prefetch', queueController.prefetch);

/**
 * Start a new session
 * POST /api/queue/newsession
 * Clears queue and resets session state
 */
router.post('/queue/newsession', queueController.newSession);

module.exports = { router };