/**
 * Migration 009: Add source_url column to songs table
 * This preserves the original URL when a song is downloaded, allowing re-download if the file is lost
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
            logger.warn('songs table does not exist, skipping migration 009');
            return;
        }
        
        // Add source_url column to songs table if it doesn't exist
        try {
            db.exec(`
                ALTER TABLE songs 
                ADD COLUMN source_url TEXT
            `);
        } catch (error) {
            // Column might already exist, which is fine
            if (!error.message.includes('duplicate column')) {
                throw error;
            }
        }
    },
    
    async down(db) {
        // SQLite doesn't support DROP COLUMN directly
        // This would require recreating the table, which is complex
        // For now, we'll leave it as a no-op
        // In production, you'd need to recreate the table without the column
    }
};

