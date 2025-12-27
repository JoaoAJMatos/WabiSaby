/**
 * Migration 008: Create user notification preferences table
 * Creates: user_notification_preferences table
 */

module.exports = {
    async up(db) {
        // User notification preferences table
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_notification_preferences (
                whatsapp_id TEXT PRIMARY KEY,
                notifications_enabled BOOLEAN NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
    },
    
    async down(db) {
        db.exec('DROP TABLE IF EXISTS user_notification_preferences');
    }
};

