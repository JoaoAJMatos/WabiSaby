const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { logger } = require('../utils/logger');

let db = null;

/**
 * Initialize database connection and create tables
 * @returns {Database} Database instance
 */
function initializeDatabase() {
    if (db) {
        return db;
    }

    const dbPath = config.paths.database;
    
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    
    db.pragma('foreign_keys = ON');
    
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schema);
        logger.info('Database schema initialized');
    } else {
        logger.error('Schema file not found:', schemaPath);
        throw new Error('Database schema file not found');
    }

    const playbackState = db.prepare('SELECT COUNT(*) as count FROM playback_state').get();
    if (playbackState.count === 0) {
        db.prepare('INSERT INTO playback_state (id) VALUES (1)').run();
    }

    const effects = db.prepare('SELECT COUNT(*) as count FROM effects').get();
    if (effects.count === 0) {
        db.prepare('INSERT INTO effects (id) VALUES (1)').run();
    }

    logger.info(`Database initialized at: ${dbPath}`);
    return db;
}

/**
 * Get database instance (initialize if needed)
 * @returns {Database} Database instance
 */
function getDatabase() {
    if (!db) {
        return initializeDatabase();
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
