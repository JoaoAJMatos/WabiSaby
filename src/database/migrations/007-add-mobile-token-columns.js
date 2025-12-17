/**
 * Migration 007: Add mobile token columns to priority_users table
 * Adds: mobile_token, token_created_at, device_fingerprint, fingerprint_created_at
 */

const { logger } = require('../../utils/logger.util');

module.exports = {
    async up(db) {
        // Check if columns already exist
        const tableInfo = db.prepare("PRAGMA table_info(priority_users)").all();
        const columnNames = tableInfo.map(col => col.name);
        
        if (!columnNames.includes('mobile_token')) {
            db.exec('ALTER TABLE priority_users ADD COLUMN mobile_token TEXT;');
        }
        
        if (!columnNames.includes('token_created_at')) {
            db.exec('ALTER TABLE priority_users ADD COLUMN token_created_at INTEGER;');
        }
        
        if (!columnNames.includes('device_fingerprint')) {
            db.exec('ALTER TABLE priority_users ADD COLUMN device_fingerprint TEXT;');
        }
        
        if (!columnNames.includes('fingerprint_created_at')) {
            db.exec('ALTER TABLE priority_users ADD COLUMN fingerprint_created_at INTEGER;');
        }
    },
    
    async down(db) {
        // SQLite doesn't support DROP COLUMN directly
        // This would require recreating the table, which is complex
        // For now, we'll just log a warning
        logger.warn('Rollback not supported for this migration (SQLite limitation)');
    }
};

