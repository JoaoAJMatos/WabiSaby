/**
 * Migration 010: Add user language preference
 * Adds language column to user_notification_preferences table
 */

module.exports = {
    async up(db) {
        // Add language column to user_notification_preferences table
        // Default to 'en' (English)
        db.exec(`
            ALTER TABLE user_notification_preferences
            ADD COLUMN language TEXT NOT NULL DEFAULT 'en'
        `);
    },
    
    async down(db) {
        // SQLite doesn't support DROP COLUMN directly
        // We need to recreate the table without the language column
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_notification_preferences_backup (
                whatsapp_id TEXT PRIMARY KEY,
                notifications_enabled BOOLEAN NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        db.exec(`
            INSERT INTO user_notification_preferences_backup
            SELECT whatsapp_id, notifications_enabled, updated_at
            FROM user_notification_preferences
        `);
        
        db.exec('DROP TABLE user_notification_preferences');
        db.exec('ALTER TABLE user_notification_preferences_backup RENAME TO user_notification_preferences');
    }
};

