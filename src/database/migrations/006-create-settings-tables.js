/**
 * Migration 006: Create settings and effects tables
 * Creates: settings, effects tables
 */

module.exports = {
    async up(db) {
        // Application settings table
        db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        // Audio effects settings table (single row)
        db.exec(`
            CREATE TABLE IF NOT EXISTS effects (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled BOOLEAN NOT NULL DEFAULT 1,
                speed REAL NOT NULL DEFAULT 1.0,
                pitch REAL NOT NULL DEFAULT 1.0,
                eq_bass INTEGER NOT NULL DEFAULT 0,
                eq_mid INTEGER NOT NULL DEFAULT 0,
                eq_treble INTEGER NOT NULL DEFAULT 0,
                reverb_enabled BOOLEAN NOT NULL DEFAULT 0,
                reverb_room_size REAL NOT NULL DEFAULT 0.5,
                reverb_damping REAL NOT NULL DEFAULT 0.5,
                reverb_wet_level REAL NOT NULL DEFAULT 0.3,
                echo_enabled BOOLEAN NOT NULL DEFAULT 0,
                echo_delay INTEGER NOT NULL DEFAULT 300,
                echo_decay REAL NOT NULL DEFAULT 0.4,
                delay_enabled BOOLEAN NOT NULL DEFAULT 0,
                delay_delay INTEGER NOT NULL DEFAULT 500,
                delay_feedback REAL NOT NULL DEFAULT 0.3,
                distortion_enabled BOOLEAN NOT NULL DEFAULT 0,
                distortion_drive REAL NOT NULL DEFAULT 0.5,
                compressor_enabled BOOLEAN NOT NULL DEFAULT 0,
                compressor_threshold INTEGER NOT NULL DEFAULT -20,
                compressor_ratio INTEGER NOT NULL DEFAULT 4,
                limiter_enabled BOOLEAN NOT NULL DEFAULT 0,
                limiter_limit INTEGER NOT NULL DEFAULT -1,
                preset TEXT NOT NULL DEFAULT 'normal',
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        // Initialize effects with default row
        const effects = db.prepare('SELECT COUNT(*) as count FROM effects').get();
        if (effects.count === 0) {
            db.prepare('INSERT INTO effects (id) VALUES (1)').run();
        }
    },
    
    async down(db) {
        db.exec('DROP TABLE IF EXISTS effects');
        db.exec('DROP TABLE IF EXISTS settings');
    }
};

