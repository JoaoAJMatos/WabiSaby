const { Database } = require('bun:sqlite');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { logger } = require('../../utils/logger.util');

let db = null;

/**
 * Initialize database connection and create tables
 * @returns {Promise<Database>} Database instance
 */
async function initializeDatabase() {
    if (db) {
        return db;
    }

    const dbPath = config.paths.database;
    
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    
    db.exec('PRAGMA foreign_keys = ON');
    
    try {
        const { runMigrations } = require('./migrator');
        await runMigrations(db);
    } catch (error) {
        logger.error('Error running migrations:', error);
        throw error;
    }

    logger.info(`Database initialized at: ${dbPath}`);
    return db;
}


/**
 * Get database instance (initialize if needed)
 * @returns {Database} Database instance
 * @throws {Error} If database is not initialized (call initializeDatabase first)
 */
function getDatabase() {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return db;
}

/**
 * Close database connection
 */
function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        logger.info('Database connection closed');
    }
}

/**
 * Check if database is empty (no data in key tables)
 * @returns {boolean} True if database appears empty
 */
function isDatabaseEmpty() {
    if (!db) {
        return true;
    }

    try {
        const queueCount = db.prepare('SELECT COUNT(*) as count FROM queue_items').get().count;
        const historyCount = db.prepare('SELECT COUNT(*) as count FROM play_history').get().count;
        const groupsCount = db.prepare('SELECT COUNT(*) as count FROM groups').get().count;
        const priorityCount = db.prepare('SELECT COUNT(*) as count FROM priority_users').get().count;
        
        return queueCount === 0 && historyCount === 0 && groupsCount === 0 && priorityCount === 0;
    } catch (err) {
        logger.error('Error checking if database is empty:', err);
        return true;
    }
}

module.exports = {
    initializeDatabase,
    getDatabase,
    closeDatabase,
    isDatabaseEmpty
};
