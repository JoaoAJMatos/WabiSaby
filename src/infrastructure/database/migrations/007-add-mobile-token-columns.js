/**
 * Migration 007: Add mobile token columns to priority_users table
 * Adds: mobile_token, token_created_at, device_fingerprint, fingerprint_created_at
 */

const { logger } = require('../../../utils/logger.util');

module.exports = {
    async up(db) {
        // Check if table exists by trying to get its info
        let tableInfo;
        try {
            tableInfo = db.prepare("PRAGMA table_info(priority_users)").all();
        } catch (error) {
            // Table doesn't exist or can't be accessed
            logger.warn('priority_users table does not exist or cannot be accessed, skipping migration 007');
            logger.debug('Error details:', error.message || error);
            return;
        }
        
        if (!tableInfo || tableInfo.length === 0) {
            logger.warn('priority_users table appears empty, skipping migration 007');
            return;
        }
        
        // Get existing column names
        const columnNames = tableInfo.map(col => col.name);
        
        // Add columns if they don't exist (with error handling for each)
        const columnsToAdd = [
            { name: 'mobile_token', sql: 'ALTER TABLE priority_users ADD COLUMN mobile_token TEXT;' },
            { name: 'token_created_at', sql: 'ALTER TABLE priority_users ADD COLUMN token_created_at INTEGER;' },
            { name: 'device_fingerprint', sql: 'ALTER TABLE priority_users ADD COLUMN device_fingerprint TEXT;' },
            { name: 'fingerprint_created_at', sql: 'ALTER TABLE priority_users ADD COLUMN fingerprint_created_at INTEGER;' }
        ];
        
        for (const column of columnsToAdd) {
            if (!columnNames.includes(column.name)) {
                try {
                    db.exec(column.sql);
                } catch (error) {
                    // If column already exists (duplicate column error), that's fine
                    const errorMsg = error.message || String(error);
                    if (errorMsg.includes('duplicate column') || errorMsg.includes('already exists')) {
                        logger.debug(`Column ${column.name} already exists, skipping`);
                        continue;
                    }
                    // Other errors should be thrown
                    logger.error(`Failed to add column ${column.name}:`, errorMsg);
                    throw error;
                }
            }
        }
    },
    
    async down(db) {
        // SQLite doesn't support DROP COLUMN directly
        // This would require recreating the table, which is complex
        // For now, we'll just log a warning
        logger.warn('Rollback not supported for this migration (SQLite limitation)');
    }
};

