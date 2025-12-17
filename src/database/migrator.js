const { Umzug } = require('umzug');
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger.util');

/**
 * Create Umzug migrator instance
 * @param {Database} db - Database instance
 * @returns {Umzug} Umzug instance
 */
function createMigrator(db) {
    const migrationsPath = path.join(__dirname, 'migrations');
    
    // Ensure migrations directory exists
    if (!fs.existsSync(migrationsPath)) {
        fs.mkdirSync(migrationsPath, { recursive: true });
    }
    
    return new Umzug({
        migrations: {
            glob: path.join(migrationsPath, '*.js'),
            resolve: ({ name, path: migrationPath, context }) => {
                const migration = require(migrationPath);
                return {
                    name,
                    up: async () => migration.up(db),
                    down: async () => migration.down(db),
                };
            },
        },
        context: db,
        logger: {
            info: (msg) => logger.info(`[Migration] ${msg}`),
            warn: (msg) => logger.warn(`[Migration] ${msg}`),
            error: (msg) => logger.error(`[Migration] ${msg}`),
            debug: (msg) => logger.debug(`[Migration] ${msg}`),
        },
        storage: {
            async executed({ context: db }) {
                // Get executed migrations from database
                try {
                    const migrations = db.prepare('SELECT name FROM migrations ORDER BY executed_at').all();
                    return migrations.map(m => m.name);
                } catch (error) {
                    // Table doesn't exist yet, return empty array
                    return [];
                }
            },
            async logMigration({ name, context: db }) {
                // Record migration as executed
                try {
                    db.prepare(`
                        INSERT INTO migrations (name, executed_at)
                        VALUES (?, strftime('%s', 'now'))
                    `).run(name);
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
                    `).run(name);
                }
            },
            async unlogMigration({ name, context: db }) {
                // Remove migration record (for rollback)
                db.prepare('DELETE FROM migrations WHERE name = ?').run(name);
            },
        },
    });
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
        
        const migrator = createMigrator(db);
        const pending = await migrator.pending();
        
        if (pending.length === 0) {
            logger.info('Database is up to date - no migrations to apply');
            return;
        }
        
        logger.info(`Running ${pending.length} pending migration(s)...`);
        await migrator.up();
        logger.info('All migrations applied successfully');
    } catch (error) {
        logger.error('Error running migrations:', error);
        throw error;
    }
}

module.exports = {
    createMigrator,
    runMigrations
};

