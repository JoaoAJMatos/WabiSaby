/**
 * Database Service Integration Tests
 * Tests database operations with real SQLite database
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const { initializeDatabase, getDatabase, closeDatabase } = require('../../../src/database/index');
const dbService = require('../../../src/database/db.service');

beforeEach(() => {
    // Initialize database
    initializeDatabase();
    
    // Clear all data
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
});

afterEach(() => {
    // Cleanup is handled by beforeEach
});

test('getOrCreateSong should create new song', () => {
    const songId = dbService.getOrCreateSong({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song',
        artist: 'Test Artist',
        channel: 'Test Channel',
        duration: 200000
    });
    
    expect(songId).toBeGreaterThan(0);
    
    const song = dbService.getSong(songId);
    expect(song).not.toBeNull();
    expect(song.title).toBe('Test Song');
    expect(song.artist).toBe('Test Artist');
    expect(song.channel).toBe('Test Channel');
    expect(song.duration).toBe(200000);
});

test('getOrCreateSong should return existing song if content matches', () => {
    const songId1 = dbService.getOrCreateSong({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song'
    });
    
    const songId2 = dbService.getOrCreateSong({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Updated Title'
    });
    
    expect(songId1).toBe(songId2);
    
    const song = dbService.getSong(songId1);
    expect(song.title).toBe('Updated Title');
});

test('getOrCreateRequester should create new requester', () => {
    const requesterId = dbService.getOrCreateRequester('Test User', 'user1@whatsapp');
    
    expect(requesterId).toBeGreaterThan(0);
    
    const requesters = dbService.getRequesters();
    const requester = requesters.find(r => r.id === requesterId);
    expect(requester).not.toBeUndefined();
    expect(requester.name).toBe('Test User');
    expect(requester.whatsapp_id).toBe('user1@whatsapp');
});

test('getOrCreateRequester should return existing requester by name', () => {
    const id1 = dbService.getOrCreateRequester('Test User', 'user1@whatsapp');
    const id2 = dbService.getOrCreateRequester('Test User', 'user2@whatsapp');
    
    expect(id1).toBe(id2);
});

test('addQueueItem should add item to queue', () => {
    const songId = dbService.getOrCreateSong({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song'
    });
    const requesterId = dbService.getOrCreateRequester('Test User');
    
    const queueItemId = dbService.addQueueItem({
        song_id: songId,
        requester_id: requesterId,
        position: 0,
        is_priority: false
    });
    
    expect(queueItemId).toBeGreaterThan(0);
    
    const queueItems = dbService.getQueueItems();
    expect(queueItems.length).toBe(1);
    expect(queueItems[0].id).toBe(queueItemId);
});

test('removeQueueItem should remove item from queue', () => {
    const songId = dbService.getOrCreateSong({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song'
    });
    const requesterId = dbService.getOrCreateRequester('Test User');
    
    const queueItemId = dbService.addQueueItem({
        song_id: songId,
        requester_id: requesterId,
        position: 0
    });
    
    dbService.removeQueueItem(queueItemId);
    
    const queueItems = dbService.getQueueItems();
    expect(queueItems.length).toBe(0);
});

test('reorderQueue should reorder queue items', () => {
    const song1 = dbService.getOrCreateSong({ content: 'url1', title: 'Song 1' });
    const song2 = dbService.getOrCreateSong({ content: 'url2', title: 'Song 2' });
    const requester = dbService.getOrCreateRequester('Test User');
    
    const id1 = dbService.addQueueItem({ song_id: song1, requester_id: requester, position: 0 });
    const id2 = dbService.addQueueItem({ song_id: song2, requester_id: requester, position: 1 });
    
    dbService.reorderQueue(0, 1);
    
    const queueItems = dbService.getQueueItems();
    expect(queueItems[0].id).toBe(id2);
    expect(queueItems[1].id).toBe(id1);
});

test('updatePlaybackState should update playback state', () => {
    const songId = dbService.getOrCreateSong({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song'
    });
    
    dbService.updatePlaybackState({
        is_playing: 1,
        is_paused: 0,
        current_song_id: songId,
        songs_played: 5
    });
    
    const state = dbService.getPlaybackState();
    expect(state.is_playing).toBe(1);
    expect(state.is_paused).toBe(0);
    expect(state.current_song_id).toBe(songId);
    expect(state.songs_played).toBe(5);
});

test('isPriorityUser should check if user is priority', () => {
    expect(dbService.isPriorityUser('vip@whatsapp')).toBe(false);
    
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    
    expect(dbService.isPriorityUser('vip@whatsapp')).toBe(true);
});

test('addPriorityUser should add priority user', () => {
    const result = dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    expect(result).toBe(true);
    
    const priorityUsers = dbService.getPriorityUsers();
    expect(priorityUsers.length).toBe(1);
    expect(priorityUsers[0].whatsapp_id).toBe('vip@whatsapp');
});

test('removePriorityUser should remove priority user', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    expect(dbService.isPriorityUser('vip@whatsapp')).toBe(true);
    
    const result = dbService.removePriorityUser('vip@whatsapp');
    expect(result).toBe(true);
    
    expect(dbService.isPriorityUser('vip@whatsapp')).toBe(false);
});

test('getGroups should return all groups', () => {
    expect(dbService.getGroups().length).toBe(0);
    
    dbService.addGroup('group1@whatsapp', 'Test Group 1');
    dbService.addGroup('group2@whatsapp', 'Test Group 2');
    
    const groups = dbService.getGroups();
    expect(groups.length).toBe(2);
    expect(groups.find(g => g.id === 'group1@whatsapp')).not.toBeUndefined();
});

test('generateMobileToken should generate a secure token', () => {
    const token1 = dbService.generateMobileToken();
    const token2 = dbService.generateMobileToken();
    
    expect(token1).toBeTruthy();
    expect(token2).toBeTruthy();
    expect(typeof token1).toBe('string');
    expect(typeof token2).toBe('string');
    expect(token1.length).toBeGreaterThan(0);
    expect(token2.length).toBeGreaterThan(0);
    // Tokens should be different
    expect(token1).not.toBe(token2);
});

test('setMobileToken should store token for VIP user', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    const token = dbService.generateMobileToken();
    
    const result = dbService.setMobileToken('vip@whatsapp', token);
    
    expect(result).toBe(true);
    
    const storedToken = dbService.getMobileToken('vip@whatsapp');
    expect(storedToken).toBe(token);
});

test('setMobileToken should return false for invalid inputs', () => {
    expect(dbService.setMobileToken(null, 'token')).toBe(false);
    expect(dbService.setMobileToken('vip@whatsapp', null)).toBe(false);
    expect(dbService.setMobileToken('', 'token')).toBe(false);
    expect(dbService.setMobileToken('vip@whatsapp', '')).toBe(false);
});

test('getMobileToken should retrieve token for VIP user', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    const token = dbService.generateMobileToken();
    dbService.setMobileToken('vip@whatsapp', token);
    
    const retrievedToken = dbService.getMobileToken('vip@whatsapp');
    
    expect(retrievedToken).toBe(token);
});

test('getMobileToken should return null when no token exists', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    
    const token = dbService.getMobileToken('vip@whatsapp');
    
    expect(token).toBeNull();
});

test('getMobileToken should return null for invalid whatsappId', () => {
    expect(dbService.getMobileToken(null)).toBeNull();
    expect(dbService.getMobileToken(undefined)).toBeNull();
    expect(dbService.getMobileToken('')).toBeNull();
});

test('getVipByToken should return VIP info by token', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    const token = dbService.generateMobileToken();
    dbService.setMobileToken('vip@whatsapp', token);
    
    const vip = dbService.getVipByToken(token);
    
    expect(vip).not.toBeNull();
    expect(vip.whatsapp_id).toBe('vip@whatsapp');
    expect(vip.name).toBe('VIP User');
});

test('getVipByToken should return null for invalid token', () => {
    expect(dbService.getVipByToken(null)).toBeNull();
    expect(dbService.getVipByToken(undefined)).toBeNull();
    expect(dbService.getVipByToken('')).toBeNull();
    expect(dbService.getVipByToken('invalid-token')).toBeNull();
});

test('storeDeviceFingerprint should store fingerprint for token', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    const token = dbService.generateMobileToken();
    dbService.setMobileToken('vip@whatsapp', token);
    
    const fingerprint = 'device-fingerprint-hash-123';
    const result = dbService.storeDeviceFingerprint(token, fingerprint);
    
    expect(result).toBe(true);
    
    // Verify fingerprint is stored using service function
    const vip = dbService.getVipByToken(token);
    expect(vip.device_fingerprint).toBe(fingerprint);
    expect(vip.fingerprint_created_at).toBeTruthy();
});

test('storeDeviceFingerprint should return false for invalid inputs', () => {
    expect(dbService.storeDeviceFingerprint(null, 'fingerprint')).toBe(false);
    expect(dbService.storeDeviceFingerprint('token', null)).toBe(false);
    expect(dbService.storeDeviceFingerprint('', 'fingerprint')).toBe(false);
    expect(dbService.storeDeviceFingerprint('token', '')).toBe(false);
});

test('verifyDeviceFingerprint should return true when fingerprint matches', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    const token = dbService.generateMobileToken();
    dbService.setMobileToken('vip@whatsapp', token);
    
    const fingerprint = 'device-fingerprint-hash-123';
    dbService.storeDeviceFingerprint(token, fingerprint);
    
    const isValid = dbService.verifyDeviceFingerprint(token, fingerprint);
    
    expect(isValid).toBe(true);
});

test('verifyDeviceFingerprint should return false when fingerprint does not match', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    const token = dbService.generateMobileToken();
    dbService.setMobileToken('vip@whatsapp', token);
    
    const fingerprint = 'device-fingerprint-hash-123';
    dbService.storeDeviceFingerprint(token, fingerprint);
    
    const isValid = dbService.verifyDeviceFingerprint(token, 'wrong-fingerprint');
    
    expect(isValid).toBe(false);
});

test('verifyDeviceFingerprint should return true on first access (no fingerprint set)', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    const token = dbService.generateMobileToken();
    dbService.setMobileToken('vip@whatsapp', token);
    // Don't set fingerprint
    
    const isValid = dbService.verifyDeviceFingerprint(token, 'any-fingerprint');
    
    expect(isValid).toBe(true);
});

test('verifyDeviceFingerprint should return false for invalid inputs', () => {
    expect(dbService.verifyDeviceFingerprint(null, 'fingerprint')).toBe(false);
    expect(dbService.verifyDeviceFingerprint('token', null)).toBe(false);
    expect(dbService.verifyDeviceFingerprint('', 'fingerprint')).toBe(false);
    expect(dbService.verifyDeviceFingerprint('token', '')).toBe(false);
});

test('verifyDeviceFingerprint should return false for non-existent token', () => {
    const isValid = dbService.verifyDeviceFingerprint('non-existent-token', 'fingerprint');
    
    expect(isValid).toBe(false);
});

test('Mobile token operations should work together', () => {
    // Add VIP user
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    
    // Generate and set token
    const token = dbService.generateMobileToken();
    dbService.setMobileToken('vip@whatsapp', token);
    
    // Retrieve token
    const retrievedToken = dbService.getMobileToken('vip@whatsapp');
    expect(retrievedToken).toBe(token);
    
    // Get VIP by token
    const vip = dbService.getVipByToken(token);
    expect(vip.whatsapp_id).toBe('vip@whatsapp');
    
    // Store and verify fingerprint
    const fingerprint = 'device-fingerprint-hash';
    dbService.storeDeviceFingerprint(token, fingerprint);
    
    const isValid = dbService.verifyDeviceFingerprint(token, fingerprint);
    expect(isValid).toBe(true);
    
    // Verify wrong fingerprint fails
    const isInvalid = dbService.verifyDeviceFingerprint(token, 'wrong-fingerprint');
    expect(isInvalid).toBe(false);
});

