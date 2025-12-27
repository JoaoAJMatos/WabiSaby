const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');

/**
 * Stats Routes
 * Handles statistics endpoints
 */

/**
 * GET /api/stats
 * Get all statistics
 */
router.get('/', statsController.getStats);

/**
 * GET /api/stats/overview
 * Get detailed overview statistics
 */
router.get('/overview', statsController.getOverview);

/**
 * GET /api/stats/artists
 * Get top artists
 */
router.get('/artists', statsController.getTopArtists);

/**
 * GET /api/stats/requesters
 * Get top requesters
 */
router.get('/requesters', statsController.getTopRequesters);

/**
 * GET /api/stats/history
 * Get recent play history
 */
router.get('/history', statsController.getHistory);

/**
 * POST /api/stats/record
 * Record a played song (called by player when song starts)
 */
router.post('/record', statsController.recordSong);

/**
 * POST /api/stats/reset
 * Reset all statistics
 */
router.post('/reset', statsController.resetStats);

/**
 * GET /api/stats/debug
 * Get raw stats data for debugging
 */
router.get('/debug', statsController.getDebugStats);

module.exports = { router };

