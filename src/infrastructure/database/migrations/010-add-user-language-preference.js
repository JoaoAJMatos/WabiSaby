/**
 * Migration 010: Add user language preference
 * Adds language column to user_notification_preferences table
 */

const { logger } = require('../../../utils/logger.util');

module.exports = {
    async up(db) {
        // Check if table exists first
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='user_notification_preferences'
        `).get();
        
        if (!tableExists) {
            logger.warn('user_notification_preferences table does not exist, skipping migration 010');
            return;
        }
        
        // Check if column already exists
        const tableInfo = db.prepare("PRAGMA table_info(user_notification_preferences)").all();
        const columnNames = tableInfo.map(col => col.name);
        
        if (columnNames.includes('language')) {
            // Column already exists, skip
            return;
        }
        
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

