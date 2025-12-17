/**
 * Migration 001: Create core music data tables
 * Creates: songs, requesters tables and indexes
 */

module.exports = {
    async up(db) {
        // Songs/Tracks table
        db.exec(`
            CREATE TABLE IF NOT EXISTS songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT,
                channel TEXT,
                duration INTEGER,
                thumbnail_path TEXT,
                thumbnail_url TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                UNIQUE(content)
            )
        `);
        
        // Create indexes for songs
        db.exec('CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_songs_channel ON songs(channel)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs(created_at)');
        
        // Requesters table
        db.exec(`
            CREATE TABLE IF NOT EXISTS requesters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                whatsapp_id TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        // Create indexes for requesters
        db.exec('CREATE INDEX IF NOT EXISTS idx_requesters_name ON requesters(name)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_requesters_whatsapp_id ON requesters(whatsapp_id)');
    },
    
    async down(db) {
        db.exec('DROP TABLE IF EXISTS requesters');
        db.exec('DROP TABLE IF EXISTS songs');
    }
};

