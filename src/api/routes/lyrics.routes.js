const express = require('express');
const { getLyrics } = require('../../services/lyrics.service');
const { logger } = require('../../utils/logger.util');

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
router.get('/lyrics', async (req, res) => {
    const { title, artist, duration } = req.query;
    
    if (!title) {
        return res.status(400).json({ error: 'Title parameter is required' });
    }
    
    try {
        // Parse duration to number (it's in seconds)
        const durationSec = duration ? parseFloat(duration) : null;
        
        const lyrics = await getLyrics(title, artist, durationSec);
        
        if (!lyrics) {
            return res.status(404).json({ error: 'Lyrics not found' });
        }
        
        res.json(lyrics);
    } catch (error) {
        logger.error(`Error in lyrics route: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = { router };

