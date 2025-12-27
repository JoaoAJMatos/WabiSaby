const express = require('express');
const lyricsController = require('../controllers/lyrics.controller');

const router = express.Router();

/**
 * Lyrics Routes
 * Handles lyrics retrieval
 */

/**
 * Get lyrics for a song
 * GET /api/lyrics?title=Song Title&artist=Artist&duration=180
 * Duration is optional but helps match the correct version of the song
 */
router.get('/lyrics', lyricsController.getLyrics);

module.exports = { router };

