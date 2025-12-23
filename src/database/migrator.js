const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger.util');

/**
 * Verify that tables expected by a migration actually exist
 * @param {Database} db - Database instance
 * @param {string} migrationName - Name of the migration file
 * @returns {boolean} True if all expected tables exist
 */
function verifyMigrationTables(db, migrationName) {
    // Map of migration names to tables they should create
    const migrationTables = {
        '001-create-core-tables.js': ['songs', 'requesters'],
        '002-create-queue-tables.js': ['queue_items', 'playback_state'],
        '003-create-statistics-tables.js': ['play_history', 'hourly_stats'],
        '004-create-groups-and-users-tables.js': ['groups', 'priority_users'],
        '005-create-playlists-tables.js': ['playlists', 'playlist_items'],
        '006-create-settings-tables.js': ['settings', 'effects'],
        '007-add-mobile-token-columns.js': ['priority_users'], // modifies existing table
        '008-create-user-notification-preferences.js': ['user_notification_preferences'],
        '009-add-source-url-to-songs.js': ['songs'], // modifies existing table
        '010-add-user-language-preference.js': ['user_notification_preferences'], // modifies existing table
        '011-add-volume-normalization.js': ['songs'], // modifies existing table
    };

    const expectedTables = migrationTables[migrationName];
    if (!expectedTables) {
        // Unknown migration, assume it's valid
        return true;
    }

    // Check if all expected tables exist
    for (const tableName of expectedTables) {
        try {
            const result = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name=?
            `).get(tableName);
            
            if (!result) {
                logger.warn(`Migration ${migrationName} marked as executed but table ${tableName} is missing`);
                return false;
            }
        } catch (error) {
            logger.warn(`Error checking table ${tableName} for migration ${migrationName}:`, error);
            return false;
        }
    }

    return true;
}

/**
 * Get all migration files from the migrations directory
 * @returns {Array<string>} Sorted array of migration filenames
 */
function getMigrationFiles() {
    const migrationsPath = path.join(__dirname, 'migrations');
    
    if (!fs.existsSync(migrationsPath)) {
        logger.warn(`Migrations directory not found: ${migrationsPath}`);
        return [];
    }
    
    const files = fs.readdirSync(migrationsPath)
        .filter(f => f.endsWith('.js') && !f.includes('README'))
        .sort(); // Already numbered, so sort() will work correctly
    
    return files;
}

/**
 * Get executed migrations from database
 * @param {Database} db - Database instance
 * @returns {Array<string>} Array of executed migration filenames
 */
function getExecutedMigrations(db) {
    try {
        const migrations = db.prepare('SELECT name FROM migrations ORDER BY executed_at').all();
        return migrations.map(m => m.name);
    } catch (error) {
        // Table doesn't exist yet, return empty array
        return [];
    }
}

/**
 * Mark a migration as executed
 * @param {Database} db - Database instance
 * @param {string} migrationName - Name of the migration file
 */
function markMigrationAsExecuted(db, migrationName) {
    try {
        db.prepare(`
            INSERT INTO migrations (name, executed_at)
            VALUES (?, strftime('%s', 'now'))
        `).run(migrationName);
    } catch (error) {
        // If table doesn't exist, create it
        db.exec(`
            CREATE TABLE IF NOT EXISTS migrations (
                name TEXT PRIMARY KEY,
                executed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
        db.prepare(`
            INSERT INTO migrations (name, executed_at)
            VALUES (?, strftime('%s', 'now'))
        `).run(migrationName);
    }
}

/**
 * Run pending migrations
 * @param {Database} db - Database instance
 */
async function runMigrations(db) {
    try {
        // Ensure migrations table exists
        db.exec(`
            CREATE TABLE IF NOT EXISTS migrations (
                name TEXT PRIMARY KEY,
                executed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        // Get all migration files and executed migrations
        const migrationFiles = getMigrationFiles();
        const executedMigrations = getExecutedMigrations(db);
        
        logger.info(`Found ${migrationFiles.length} migration file(s), ${executedMigrations.length} already executed`);
        
        // Verify executed migrations have their tables
        for (const name of executedMigrations) {
            if (!verifyMigrationTables(db, name)) {
                logger.warn(`Removing ${name} from executed migrations - tables are missing`);
                db.prepare('DELETE FROM migrations WHERE name = ?').run(name);
            }
        }
        
        // Get updated executed list after cleanup
        const verifiedExecuted = getExecutedMigrations(db);
        
        // Find pending migrations
        const pendingMigrations = migrationFiles.filter(f => !verifiedExecuted.includes(f));
        
        if (pendingMigrations.length === 0) {
            logger.info('Database is up to date - no migrations to apply');
            return;
        }
        
        logger.info(`Running ${pendingMigrations.length} pending migration(s)...`);
        
        // Run each pending migration in order
        const migrationsPath = path.join(__dirname, 'migrations');
        for (const migrationFile of pendingMigrations) {
            const migrationPath = path.join(migrationsPath, migrationFile);
            
            try {
                logger.info(`Running migration: ${migrationFile}`);
                const migration = require(migrationPath);
                
                if (!migration || !migration.up) {
                    throw new Error(`Migration ${migrationFile} does not export an 'up' function`);
                }
                
                // Run the migration
                await migration.up(db);
                
                // Mark as executed
                markMigrationAsExecuted(db, migrationFile);
                
                logger.info(`✓ Migration ${migrationFile} completed successfully`);
            } catch (error) {
                logger.error(`✗ Migration ${migrationFile} failed:`, error);
                throw new Error(`Migration ${migrationFile} failed: ${error.message}`);
            }
        }
        
        logger.info('All migrations applied successfully');
    } catch (error) {
        logger.error('Error running migrations:', error);
        throw error;
    }
}

module.exports = {
    runMigrations
};
