/**
 * Migration 002: Create queue management tables
 * Creates: queue_items, playback_state tables and indexes
 */

module.exports = {
    async up(db) {
        // Queue items table
        db.exec(`
            CREATE TABLE IF NOT EXISTS queue_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                song_id INTEGER NOT NULL,
                requester_id INTEGER NOT NULL,
                group_id TEXT,
                sender_id TEXT,
                position INTEGER NOT NULL,
                is_priority BOOLEAN NOT NULL DEFAULT 0,
                download_status TEXT DEFAULT 'pending',
                download_progress INTEGER DEFAULT 0,
                prefetched BOOLEAN DEFAULT 0,
                added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
                FOREIGN KEY (requester_id) REFERENCES requesters(id)
            )
        `);
        
        // Create indexes for queue_items
        db.exec('CREATE INDEX IF NOT EXISTS idx_queue_position ON queue_items(position)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue_items(is_priority, position)');
        
        // Playback state table (single row)
        db.exec(`
            CREATE TABLE IF NOT EXISTS playback_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                current_song_id INTEGER,
                current_queue_item_id INTEGER,
                is_playing BOOLEAN NOT NULL DEFAULT 0,
                is_paused BOOLEAN NOT NULL DEFAULT 0,
                start_time INTEGER,
                paused_at INTEGER,
                seek_position INTEGER,
                songs_played INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (current_song_id) REFERENCES songs(id),
                FOREIGN KEY (current_queue_item_id) REFERENCES queue_items(id)
            )
        `);
        
        // Initialize playback_state with default row
        const playbackState = db.prepare('SELECT COUNT(*) as count FROM playback_state').get();
        if (playbackState.count === 0) {
            db.prepare('INSERT INTO playback_state (id) VALUES (1)').run();
        }
    },
    
    async down(db) {
        db.exec('DROP TABLE IF EXISTS playback_state');
        db.exec('DROP TABLE IF EXISTS queue_items');
    }
};

