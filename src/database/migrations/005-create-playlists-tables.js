/**
 * Migration 005: Create playlists tables
 * Creates: playlists, playlist_items tables and indexes
 */

module.exports = {
    async up(db) {
        // Saved playlists table
        db.exec(`
            CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source TEXT,
                source_url TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        // Playlist items table
        db.exec(`
            CREATE TABLE IF NOT EXISTS playlist_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT,
                url TEXT,
                search_query TEXT,
                position INTEGER NOT NULL,
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
            )
        `);
        
        // Create index for playlist_items
        db.exec('CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id, position)');
    },
    
    async down(db) {
        db.exec('DROP TABLE IF EXISTS playlist_items');
        db.exec('DROP TABLE IF EXISTS playlists');
    }
};

