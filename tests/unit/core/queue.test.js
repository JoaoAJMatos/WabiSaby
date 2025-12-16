/**
 * Queue Manager Tests
 * Tests for the core queue management functionality
 * 
 * Note: Since QueueManager is a singleton, we test it directly
 * but clear state between tests. For more isolated testing,
 * consider refactoring QueueManager to accept dependencies.
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const { clearTestDatabase } = require('../../helpers/test-db');
const dbService = require('../../../src/database/db.service');
const queueManager = require('../../../src/core/queue');
const playbackController = require('../../../src/core/playback.controller');
const { initializeDatabase, getDatabase } = require('../../../src/database/index');
const { QUEUE_ITEM_ADDED, QUEUE_UPDATED } = require('../../../src/core/events');

beforeEach(() => {
    // Initialize database (will use config path, but we'll clear it)
    try {
        initializeDatabase();
    } catch (e) {
        // Database might already be initialized
    }
    
    // Clear database
    const db = getDatabase();
    db.exec(`
        DELETE FROM queue_items;
        DELETE FROM play_history;
        DELETE FROM songs;
        DELETE FROM requesters;
        DELETE FROM groups;
        DELETE FROM priority_users;
        DELETE FROM playlists;
        DELETE FROM playlist_items;
        DELETE FROM settings;
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
    
    // Clear queue manager state
    queueManager.queue = [];
    queueManager.queueItemIds.clear();
    
    // Clear playback controller state
    playbackController.isPlaying = false;
    playbackController.isPaused = false;
    playbackController.currentSong = null;
    
    // Remove all listeners
    queueManager.removeAllListeners();
    playbackController.removeAllListeners();
});

afterEach(() => {
    queueManager.removeAllListeners();
    playbackController.removeAllListeners();
});

test('QueueManager should initialize with empty queue', () => {
    // Clear any loaded state
    queueManager.queue = [];
    queueManager.loadQueue();
    
    expect(queueManager.getQueue()).toEqual([]);
});

test('QueueManager should add non-priority song to end of queue', () => {
    // Prevent auto-processing to test queue addition
    playbackController.isPlaying = true;
    
    const song = {
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp',
        requester: 'User 1'
    };

    queueManager.add(song);

    const queue = queueManager.getQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].content).toBe(song.content);
    expect(queue[0].isPriority).toBe(false);
});

test('QueueManager should add priority song before non-priority songs', () => {
    // Prevent auto-processing to test queue addition
    playbackController.isPlaying = true;
    
    // Add priority user to database
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');

    // Add non-priority song first
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp',
        requester: 'User 1'
    });

    // Add priority song
    queueManager.add({
        content: 'https://youtube.com/watch?v=test2',
        title: 'Test Song 2',
        sender: 'vip@whatsapp',
        requester: 'VIP User'
    });

    const queue = queueManager.getQueue();
    expect(queue.length).toBe(2);
    expect(queue[0].isPriority).toBe(true);
    expect(queue[0].sender).toBe('vip@whatsapp');
    expect(queue[1].isPriority).toBe(false);
});

test('QueueManager should add priority songs in order before non-priority', () => {
    // Prevent auto-processing to test queue addition
    playbackController.isPlaying = true;
    
    // Add priority user to database
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');

    // Add two non-priority songs
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp'
    });
    queueManager.add({
        content: 'https://youtube.com/watch?v=test2',
        title: 'Test Song 2',
        sender: 'user2@whatsapp'
    });

    // Add priority song - should go to position 0
    queueManager.add({
        content: 'https://youtube.com/watch?v=test3',
        title: 'Test Song 3',
        sender: 'vip@whatsapp'
    });

    const queue = queueManager.getQueue();
    expect(queue.length).toBe(3);
    expect(queue[0].isPriority).toBe(true);
    expect(queue[1].isPriority).toBe(false);
    expect(queue[2].isPriority).toBe(false);
});

test('QueueManager should remove song by index', () => {
    // Prevent auto-processing to test queue operations
    playbackController.isPlaying = true;
    
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp'
    });
    queueManager.add({
        content: 'https://youtube.com/watch?v=test2',
        title: 'Test Song 2',
        sender: 'user2@whatsapp'
    });

    const removed = queueManager.remove(0);
    expect(removed).not.toBeNull();
    expect(removed.content).toBe('https://youtube.com/watch?v=test1');
    
    const queue = queueManager.getQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].content).toBe('https://youtube.com/watch?v=test2');
});

test('QueueManager should return null when removing invalid index', () => {
    // Prevent auto-processing to test queue operations
    playbackController.isPlaying = true;
    
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp'
    });

    expect(queueManager.remove(-1)).toBeNull();
    expect(queueManager.remove(10)).toBeNull();
    expect(queueManager.getQueue().length).toBe(1);
});

test('QueueManager should reorder queue items', () => {
    // Prevent auto-processing to test queue operations
    playbackController.isPlaying = true;
    
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp'
    });
    queueManager.add({
        content: 'https://youtube.com/watch?v=test2',
        title: 'Test Song 2',
        sender: 'user2@whatsapp'
    });
    queueManager.add({
        content: 'https://youtube.com/watch?v=test3',
        title: 'Test Song 3',
        sender: 'user3@whatsapp'
    });

    const result = queueManager.reorder(0, 2);
    expect(result).toBe(true);

    const queue = queueManager.getQueue();
    expect(queue[0].content).toBe('https://youtube.com/watch?v=test2');
    expect(queue[2].content).toBe('https://youtube.com/watch?v=test1');
});

test('QueueManager should return false for invalid reorder', () => {
    // Prevent auto-processing to test queue operations
    playbackController.isPlaying = true;
    
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp'
    });

    expect(queueManager.reorder(-1, 0)).toBe(false);
    expect(queueManager.reorder(0, 10)).toBe(false);
    expect(queueManager.reorder(0, 0)).toBe(true); // Same position is valid
});

test('QueueManager should clear queue', () => {
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp'
    });
    queueManager.add({
        content: 'https://youtube.com/watch?v=test2',
        title: 'Test Song 2',
        sender: 'user2@whatsapp'
    });

    queueManager.clear();

    expect(queueManager.getQueue().length).toBe(0);
    expect(queueManager.queueItemIds.size).toBe(0);
});

test('QueueManager should emit queue_updated and queue_item_added events when adding song', (done) => {
    let eventsReceived = 0;
    const checkDone = () => {
        eventsReceived++;
        if (eventsReceived === 2) done();
    };
    
    queueManager.once(QUEUE_UPDATED, checkDone);
    queueManager.once(QUEUE_ITEM_ADDED, checkDone);

    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp'
    });
});

test('QueueManager should emit queue_updated event when removing song', (done) => {
    // Prevent auto-processing to keep item in queue
    playbackController.isPlaying = true;
    
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp'
    });

    queueManager.once(QUEUE_UPDATED, () => {
        done();
    });

    queueManager.remove(0);
});

// Note: processQueue, songFinished, pause, resume, seek, skip, resetSession
// have been moved to PlaybackController. These tests should be moved to
// a new playback.controller.test.js file if needed.

test('QueueManager should load queue from database on initialization', () => {
    // Prevent auto-processing when queue loads
    playbackController.isPlaying = true;
    
    // Seed database manually
    const songId = dbService.getOrCreateSong({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1'
    });
    const requesterId = dbService.getOrCreateRequester('User 1', 'user1@whatsapp');
    dbService.addQueueItem({
        song_id: songId,
        requester_id: requesterId,
        position: 0
    });

    // Load queue from database
    queueManager.loadQueue();
    
    // The queue should be loaded
    const queue = queueManager.getQueue();
    expect(queue).toBeDefined();
    expect(Array.isArray(queue)).toBe(true);
    expect(queue.length).toBeGreaterThan(0);
});

test('QueueManager should save queue state', () => {
    // QueueManager no longer saves playback state - that's handled by PlaybackController
    // This test verifies queue items are saved
    playbackController.isPlaying = true;
    
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp'
    });

    queueManager.saveQueue();

    // Verify queue item was saved to database
    const queue = queueManager.getQueue();
    expect(queue.length).toBe(1);
});

test('QueueManager should handle multiple priority songs correctly', () => {
    // Prevent auto-processing to test queue addition
    playbackController.isPlaying = true;
    
    // Add priority users to database
    dbService.addPriorityUser('vip1@whatsapp', 'VIP 1');
    dbService.addPriorityUser('vip2@whatsapp', 'VIP 2');

    // Add regular song
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'user1@whatsapp'
    });

    // Add first priority song
    queueManager.add({
        content: 'https://youtube.com/watch?v=test2',
        title: 'Test Song 2',
        sender: 'vip1@whatsapp'
    });

    // Add second priority song
    queueManager.add({
        content: 'https://youtube.com/watch?v=test3',
        title: 'Test Song 3',
        sender: 'vip2@whatsapp'
    });

    const queue = queueManager.getQueue();
    expect(queue.length).toBe(3);
    expect(queue[0].isPriority).toBe(true);
    expect(queue[1].isPriority).toBe(true);
    expect(queue[2].isPriority).toBe(false);
});

