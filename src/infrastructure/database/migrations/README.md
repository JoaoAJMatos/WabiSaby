# Database Migrations

This directory contains database migration files using [Umzug](https://github.com/sequelize/umzug), a migration library similar to Flyway.

## Migration File Format

Migration files should be named with a numeric prefix and descriptive name:
- `001-create-core-tables.js`
- `002-create-queue-tables.js`
- `003-create-statistics-tables.js`
- `004-create-groups-and-users-tables.js`
- `005-create-playlists-tables.js`
- `006-create-settings-tables.js`
- `007-add-mobile-token-columns.js`
- etc.

## Current Migrations

1. **001-create-core-tables.js** - Creates `songs` and `requesters` tables
2. **002-create-queue-tables.js** - Creates `queue_items` and `playback_state` tables
3. **003-create-statistics-tables.js** - Creates `play_history` and `hourly_stats` tables
4. **004-create-groups-and-users-tables.js** - Creates `groups` and `priority_users` tables
5. **005-create-playlists-tables.js** - Creates `playlists` and `playlist_items` tables
6. **006-create-settings-tables.js** - Creates `settings` and `effects` tables
7. **007-add-mobile-token-columns.js** - Adds mobile access columns to `priority_users` table

## Migration Structure

Each migration file should export an object with `up` and `down` methods:

```javascript
module.exports = {
    async up(db) {
        // Migration logic here
        // db is the Database instance
    },
    
    async down(db) {
        // Rollback logic here (optional)
        // Note: SQLite has limitations with DROP COLUMN
    }
};
```

## Running Migrations

Migrations run automatically when the database is initialized. They are tracked in the `migrations` table to ensure each migration runs only once.

## Creating a New Migration

1. Create a new file in this directory with the next sequential number
2. Export `up` and `down` functions
3. The migration will run automatically on next startup

## Example Migration

```javascript
module.exports = {
    async up(db) {
        // Check if column exists first (idempotent)
        const tableInfo = db.prepare("PRAGMA table_info(my_table)").all();
        const columnNames = tableInfo.map(col => col.name);
        
        if (!columnNames.includes('new_column')) {
            db.exec('ALTER TABLE my_table ADD COLUMN new_column TEXT;');
        }
    },
    
    async down(db) {
        // Rollback - SQLite doesn't support DROP COLUMN easily
        logger.warn('Rollback not supported for this migration');
    }
};
```

