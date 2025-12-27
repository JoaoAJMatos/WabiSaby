/**
 * Migration 014: Add lyrics support to songs table
 * Adds lyrics_data column to songs table for storing lyrics JSON
 */

const { logger } = require('../../../utils/logger.util');

module.exports = {
    async up(db) {
        // Check if table exists first
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='songs'
        `).get();
        
        if (!tableExists) {
            logger.warn('songs table does not exist, skipping migration 014');
            return;
        }
        
        // Add lyrics_data column to songs table
        // Stores lyrics as JSON: { id, trackName, artistName, duration, plainLyrics, syncedLyrics, hasSynced }
        try {
            db.exec(`
                ALTER TABLE songs 
                ADD COLUMN lyrics_data TEXT
            `);
        } catch (error) {
            // Column might already exist, which is fine
            if (!error.message.includes('duplicate column') && !error.message.includes('already exists')) {
                throw error;
            }
        }
    },
    
    async down(db) {
        // SQLite doesn't support DROP COLUMN directly
        // For rollback, we would need to recreate the table, which is complex
        // For now, we'll leave it as a no-op
        // In production, you'd need to recreate the table without the column
    }
};

