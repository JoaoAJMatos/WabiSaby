/**
 * Test Database Utilities
 * Provides helpers for creating and managing test databases
 */

const { Database } = require('bun:sqlite');
const fs = require('fs');
const path = require('path');
const dbModule = require('../../src/database/index');

let testDb = null;
let testDbPath = null;
let originalDb = null;

/**
 * Create an in-memory test database with schema
 * Note: This creates a separate test database. For actual testing,
 * you may need to set TEST_DB_PATH environment variable or modify
 * the database module to accept a test database instance.
 * @returns {Database} Database instance
 */
function createTestDatabase() {
    if (testDb) {
        return testDb;
    }

    // Use in-memory database for tests
    testDb = new Database(':memory:');
    testDb.exec('PRAGMA foreign_keys = ON');

    // Load and execute schema
    const schemaPath = path.join(__dirname, '../../../database/schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        testDb.exec(schema);
    } else {
        throw new Error('Schema file not found');
    }

    // Initialize default rows
    const playbackState = testDb.prepare('SELECT COUNT(*) as count FROM playback_state').get();
    if (playbackState.count === 0) {
        testDb.prepare('INSERT INTO playback_state (id) VALUES (1)').run();
    }

    const effects = testDb.prepare('SELECT COUNT(*) as count FROM effects').get();
    if (effects.count === 0) {
        testDb.prepare('INSERT INTO effects (id) VALUES (1)').run();
    }

    return testDb;
}

/**
 * Create a temporary file-based test database
 * @param {string} tempDir - Temporary directory path
 * @returns {Database} Database instance
 */
function createTempTestDatabase(tempDir) {
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    testDbPath = path.join(tempDir, `test-${Date.now()}.db`);
    testDb = new Database(testDbPath);
    testDb.exec('PRAGMA foreign_keys = ON');

    // Load and execute schema
    const schemaPath = path.join(__dirname, '../../../database/schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        testDb.exec(schema);
    } else {
        throw new Error('Schema file not found');
    }

    // Initialize default rows
    const playbackState = testDb.prepare('SELECT COUNT(*) as count FROM playback_state').get();
    if (playbackState.count === 0) {
        testDb.prepare('INSERT INTO playback_state (id) VALUES (1)').run();
    }

    const effects = testDb.prepare('SELECT COUNT(*) as count FROM effects').get();
    if (effects.count === 0) {
        testDb.prepare('INSERT INTO effects (id) VALUES (1)').run();
    }

    return testDb;
}

/**
 * Get the current test database instance
 * @returns {Database} Database instance
 */
function getTestDatabase() {
    if (!testDb) {
        return createTestDatabase();
    }
    return testDb;
}

/**
 * Clear all data from test database (keeps schema)
 */
function clearTestDatabase() {
    if (!testDb) return;

    // Delete all data but keep schema
    testDb.exec(`
        DELETE FROM queue_items;
        DELETE FROM play_history;
        DELETE FROM songs;
        DELETE FROM requesters;
        DELETE FROM groups;
        DELETE FROM priority_users;
        DELETE FROM playlists;
        DELETE FROM playlist_items;
        DELETE FROM settings;
        
        -- Reset playback state
        UPDATE playback_state SET 
            current_song_id = NULL,
            current_queue_item_id = NULL,
            is_playing = 0,
            is_paused = 0,
            start_time = NULL,
            paused_at = NULL,
            seek_position = NULL,
            songs_played = 0;
    `);
}

/**
 * Close and cleanup test database
 */
function closeTestDatabase() {
    if (testDb) {
        testDb.close();
        testDb = null;
    }

    if (testDbPath && fs.existsSync(testDbPath)) {
        try {
            fs.unlinkSync(testDbPath);
        } catch (e) {
            // Ignore cleanup errors
        }
        testDbPath = null;
    }
}

/**
 * Seed test database with sample data
 * @param {Object} options - Seed options
 */
function seedTestDatabase(options = {}) {
    if (!testDb) {
        createTestDatabase();
    }

    const {
        songs = [],
        requesters = [],
        queueItems = [],
        priorityUsers = [],
        groups = []
    } = options;

    // Seed songs
    const insertSong = testDb.prepare(`
        INSERT INTO songs (content, title, artist, channel, duration, thumbnail_path, thumbnail_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    songs.forEach(song => {
        insertSong.run(
            song.content || `https://youtube.com/watch?v=${Math.random().toString(36).substring(7)}`,
            song.title || 'Test Song',
            song.artist || null,
            song.channel || null,
            song.duration || null,
            song.thumbnail_path || null,
            song.thumbnail_url || null
        );
    });

    // Seed requesters
    const insertRequester = testDb.prepare(`
        INSERT INTO requesters (name, whatsapp_id)
        VALUES (?, ?)
    `);
    requesters.forEach(requester => {
        insertRequester.run(
            requester.name || 'Test User',
            requester.whatsapp_id || null
        );
    });

    // Seed priority users
    const insertPriority = testDb.prepare(`
        INSERT INTO priority_users (whatsapp_id, name)
        VALUES (?, ?)
    `);
    priorityUsers.forEach(user => {
        insertPriority.run(
            user.whatsapp_id || 'test_vip_id',
            user.name || 'VIP User'
        );
    });

    // Seed groups
    const insertGroup = testDb.prepare(`
        INSERT INTO groups (id, name)
        VALUES (?, ?)
    `);
    groups.forEach(group => {
        insertGroup.run(
            group.id || 'test_group_id',
            group.name || 'Test Group'
        );
    });

    // Seed queue items (requires songs and requesters)
    if (queueItems.length > 0) {
        const insertQueueItem = testDb.prepare(`
            INSERT INTO queue_items (song_id, requester_id, group_id, sender_id, position, is_priority, download_status, download_progress, prefetched)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        queueItems.forEach((item, index) => {
            // Get or create song
            let songId = item.song_id;
            if (!songId && songs.length > 0) {
                songId = testDb.prepare('SELECT id FROM songs LIMIT 1').get()?.id;
            }
            if (!songId) {
                const songResult = insertSong.run(
                    item.content || `https://youtube.com/watch?v=${Math.random().toString(36).substring(7)}`,
                    item.title || 'Test Song',
                    null, null, null, null, null
                );
                songId = songResult.lastInsertRowid;
            }

            // Get or create requester
            let requesterId = item.requester_id;
            if (!requesterId && requesters.length > 0) {
                requesterId = testDb.prepare('SELECT id FROM requesters LIMIT 1').get()?.id;
            }
            if (!requesterId) {
                const reqResult = insertRequester.run('Test User', null);
                requesterId = reqResult.lastInsertRowid;
            }

            insertQueueItem.run(
                songId,
                requesterId,
                item.group_id || null,
                item.sender_id || null,
                item.position !== undefined ? item.position : index,
                item.is_priority ? 1 : 0,
                item.download_status || 'pending',
                item.download_progress || 0,
                item.prefetched ? 1 : 0
            );
        });
    }
}

module.exports = {
    createTestDatabase,
    createTempTestDatabase,
    getTestDatabase,
    clearTestDatabase,
    closeTestDatabase,
    seedTestDatabase
};

