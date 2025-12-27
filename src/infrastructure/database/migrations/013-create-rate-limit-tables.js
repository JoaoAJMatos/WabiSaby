/**
 * Migration 013: Create rate limiting tables
 * Creates rate_limit_requests table to track user request timestamps for rate limiting
 */

module.exports = {
    async up(db) {
        // Create rate_limit_requests table to track user requests
        db.exec(`
            CREATE TABLE IF NOT EXISTS rate_limit_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                command TEXT NOT NULL,
                requested_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        // Create indexes for efficient queries
        db.exec('CREATE INDEX IF NOT EXISTS idx_rate_limit_user_time ON rate_limit_requests(user_id, requested_at DESC)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_rate_limit_user_command ON rate_limit_requests(user_id, command, requested_at DESC)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_rate_limit_requested_at ON rate_limit_requests(requested_at)');
    },
    
    async down(db) {
        db.exec('DROP INDEX IF EXISTS idx_rate_limit_requested_at');
        db.exec('DROP INDEX IF EXISTS idx_rate_limit_user_command');
        db.exec('DROP INDEX IF EXISTS idx_rate_limit_user_time');
        db.exec('DROP TABLE IF EXISTS rate_limit_requests');
    }
};

