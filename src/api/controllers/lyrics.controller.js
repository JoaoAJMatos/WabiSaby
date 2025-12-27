const lyricsService = require('../../services/content/lyrics.service');
const { logger } = require('../../utils/logger.util');

/**
 * Lyrics Controller
 * Handles lyrics retrieval
 */

class LyricsController {
    /**
     * Get lyrics for a song
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async getLyrics(req, res) {
        const { title, artist, duration } = req.query;
        
        if (!title) {
            return res.status(400).json({ error: 'Title parameter is required' });
        }
        
        try {
            // Parse duration to number (it's in seconds)
            const durationSec = duration ? parseFloat(duration) : null;
            
            const lyrics = await lyricsService.getLyrics(title, artist, durationSec);
            
            if (!lyrics) {
                return res.status(404).json({ error: 'Lyrics not found' });
            }
            
            res.json(lyrics);
        } catch (error) {
            logger.error(`Error in lyrics route: ${error.message}`);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = new LyricsController();

