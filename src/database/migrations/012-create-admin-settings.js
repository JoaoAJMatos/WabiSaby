/**
 * Migration 012: Create admin settings table
 * Stores VIP management password (hashed) and other admin settings
 */

module.exports = {
    async up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS admin_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
    },
    
    async down(db) {
        db.exec('DROP TABLE IF EXISTS admin_settings');
    }
};

