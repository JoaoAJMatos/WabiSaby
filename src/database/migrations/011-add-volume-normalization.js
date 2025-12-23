/**
 * Migration 011: Add volume normalization support
 * Adds volume_gain_db column to songs table for storing per-song volume adjustments
 */

module.exports = {
    async up(db) {
        // Add volume_gain_db column to songs table
        // Stores the required gain adjustment in dB (positive = boost, negative = cut)
        try {
            db.exec(`
                ALTER TABLE songs 
                ADD COLUMN volume_gain_db REAL DEFAULT 0
            `);
        } catch (error) {
            // Column might already exist, which is fine
            if (!error.message.includes('duplicate column') && !error.message.includes('already exists')) {
                throw error;
            }
        }
        
        // Create index for faster lookups when building filter chains
        db.exec('CREATE INDEX IF NOT EXISTS idx_songs_volume_gain ON songs(volume_gain_db)');
    },
    
    async down(db) {
        // SQLite doesn't support DROP COLUMN directly
        // For rollback, we would need to recreate the table, but this is complex
        // For now, just remove the index
        db.exec('DROP INDEX IF EXISTS idx_songs_volume_gain');
        
        // Note: In a production rollback, you would need to:
        // 1. Create a backup table without volume_gain_db
        // 2. Copy data (excluding volume_gain_db)
        // 3. Drop original table
        // 4. Rename backup to original
        // This is not implemented here as it's a destructive operation
    }
};

