/**
 * Migration 004: Create groups and users tables
 * Creates: groups, priority_users tables
 */

module.exports = {
    async up(db) {
        // Monitored WhatsApp groups table
        db.exec(`
            CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        // Priority/VIP users table
        db.exec(`
            CREATE TABLE IF NOT EXISTS priority_users (
                whatsapp_id TEXT PRIMARY KEY,
                name TEXT,
                added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
    },
    
    async down(db) {
        db.exec('DROP TABLE IF EXISTS priority_users');
        db.exec('DROP TABLE IF EXISTS groups');
    }
};

