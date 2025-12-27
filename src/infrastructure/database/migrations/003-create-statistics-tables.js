/**
 * Migration 003: Create statistics and history tables
 * Creates: play_history, hourly_stats tables and indexes
 */

module.exports = {
    async up(db) {
        // Play history table
        db.exec(`
            CREATE TABLE IF NOT EXISTS play_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                song_id INTEGER NOT NULL,
                requester_id INTEGER NOT NULL,
                played_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                duration INTEGER,
                FOREIGN KEY (song_id) REFERENCES songs(id),
                FOREIGN KEY (requester_id) REFERENCES requesters(id)
            )
        `);
        
        // Create indexes for play_history
        db.exec('CREATE INDEX IF NOT EXISTS idx_history_played_at ON play_history(played_at DESC)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_history_song_id ON play_history(song_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_history_requester_id ON play_history(requester_id)');
        
        // Hourly statistics table
        db.exec(`
            CREATE TABLE IF NOT EXISTS hourly_stats (
                hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
                play_count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (hour)
            )
        `);
    },
    
    async down(db) {
        db.exec('DROP TABLE IF EXISTS hourly_stats');
        db.exec('DROP TABLE IF EXISTS play_history');
    }
};

