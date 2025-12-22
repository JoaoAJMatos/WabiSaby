/**
 * Stats Service Tests
 * Tests for statistics tracking and analytics
 */

const { test, expect, beforeEach } = require('bun:test');
const { initializeDatabase, getDatabase } = require('../../../src/database/index');
const dbService = require('../../../src/database/db.service');
const statsService = require('../../../src/services/stats.service');

beforeEach(() => {
    // Initialize database
    try {
        initializeDatabase();
    } catch (e) {
        // Database might already be initialized
    }
    
    // Clear all stats data
    const db = getDatabase();
    db.exec(`
        DELETE FROM play_history;
        DELETE FROM songs;
        DELETE FROM requesters;
    `);
    
    // Reset stats
    statsService.resetStats();
});

test('getStats should return stats object with required fields', () => {
    const stats = statsService.getStats();
    
    expect(stats).toHaveProperty('startTime');
    expect(stats).toHaveProperty('songsPlayed');
    expect(stats).toHaveProperty('totalDuration');
    expect(stats).toHaveProperty('uptime');
    expect(stats).toHaveProperty('hourlyPlays');
    expect(typeof stats.uptime).toBe('number');
});

test('getUptime should return uptime in milliseconds', () => {
    const uptime = statsService.getUptime();
    
    expect(typeof uptime).toBe('number');
    expect(uptime).toBeGreaterThanOrEqual(0);
});

test('getOverview should return overview statistics', () => {
    const overview = statsService.getOverview();
    
    expect(overview).toHaveProperty('songsPlayed');
    expect(overview).toHaveProperty('uptime');
    expect(typeof overview.uptime).toBe('number');
});

test('extractArtist should extract artist from "Artist - Song" format', () => {
    // Access extractArtist through recordSongPlayed behavior
    statsService.recordSongPlayed({
        title: 'Artist Name - Song Title',
        requester: 'User',
        content: 'url1'
    });
    
    const history = statsService.getHistory(1);
    expect(history[0].artist).toBe('Artist Name');
});

test('extractArtist should extract artist from "Song by Artist" format', () => {
    statsService.recordSongPlayed({
        title: 'Song Title by Artist Name',
        requester: 'User',
        content: 'url1'
    });
    
    const history = statsService.getHistory(1);
    expect(history[0].artist).toBe('Artist Name');
});

test('extractArtist should handle various separators', () => {
    const testCases = [
        { title: 'Artist - Song', expected: 'Artist' },
        { title: 'Artist – Song', expected: 'Artist' },
        { title: 'Artist — Song', expected: 'Artist' },
        { title: 'Artist | Song', expected: 'Artist' },
        { title: 'Artist: Song', expected: 'Artist' }
    ];
    
    testCases.forEach(({ title, expected }, index) => {
        statsService.recordSongPlayed({
            title: title,
            requester: 'User',
            content: `url${index}`
        });
    });
    
    const history = statsService.getHistory(testCases.length);
    testCases.forEach(({ expected }, index) => {
        expect(history[index].artist).toBe(expected);
    });
});

test('recordSongPlayed should record song with all data', () => {
    const song = {
        title: 'Test Song',
        artist: 'Test Artist',
        requester: 'Test User',
        sender: 'user@whatsapp',
        content: 'https://youtube.com/watch?v=test',
        duration: 180000,
        channel: 'Test Channel',
        thumbnailUrl: 'https://example.com/thumb.jpg'
    };
    
    statsService.recordSongPlayed(song);
    
    const history = statsService.getHistory(1);
    expect(history.length).toBe(1);
    expect(history[0].title).toBe('Test Song');
    expect(history[0].requester).toBe('Test User');
});

test('recordSongPlayed should handle missing optional fields', () => {
    statsService.recordSongPlayed({
        title: 'Simple Song',
        requester: 'User',
        content: 'url1'
    });
    
    const history = statsService.getHistory(1);
    expect(history[0].title).toBe('Simple Song');
    expect(history[0].requester).toBe('User');
});

test('recordSongPlayed should use content as title if title missing', () => {
    statsService.recordSongPlayed({
        content: 'https://youtube.com/watch?v=test',
        requester: 'User'
    });
    
    const history = statsService.getHistory(1);
    expect(history[0].title).toBe('https://youtube.com/watch?v=test');
});

test('recordSongPlayed should extract artist from title if not provided', () => {
    statsService.recordSongPlayed({
        title: 'Artist Name - Song Title',
        requester: 'User',
        content: 'url1'
    });
    
    const history = statsService.getHistory(1);
    expect(history[0].artist).toBe('Artist Name');
});

test('updateLastSong should update song metadata', () => {
    // Record a song first
    statsService.recordSongPlayed({
        title: 'Test Song',
        requester: 'User',
        content: 'url1',
        duration: 0 // Missing duration
    });
    
    // Update with duration
    statsService.updateLastSong('url1', { duration: 180000 });
    
    const history = statsService.getHistory(1);
    expect(history[0].duration).toBe(180000);
});

test('updateLastSong should not update if no history exists', () => {
    // Should not throw
    expect(() => {
        statsService.updateLastSong('nonexistent', { duration: 180000 });
    }).not.toThrow();
});

test('getHistory should return recent songs', async () => {
    // Record multiple songs with delays to ensure different timestamps
    for (let i = 0; i < 5; i++) {
        statsService.recordSongPlayed({
            title: `Song ${i}`,
            requester: 'User',
            content: `url${i}`
        });
        // Wait at least 1 second between recordings to ensure different timestamps
        // (database stores in seconds, so we need at least 1 second difference)
        if (i < 4) {
            await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 second delay
        }
    }
    
    const history = statsService.getHistory(3);
    expect(history.length).toBe(3);
    // Most recent should be last recorded (Song 4)
    const titles = history.map(h => h.title);
    expect(titles).toContain('Song 4');
    expect(titles).toContain('Song 3');
    expect(titles).toContain('Song 2');
    // Most recent should be first
    expect(history[0].title).toBe('Song 4');
});

test('getHistory should respect limit parameter', () => {
    for (let i = 0; i < 10; i++) {
        statsService.recordSongPlayed({
            title: `Song ${i}`,
            requester: 'User',
            content: `url${i}`
        });
    }
    
    const history = statsService.getHistory(5);
    expect(history.length).toBe(5);
});

test('getTopRequesters should return top requesters', () => {
    // Record songs from different requesters
    for (let i = 0; i < 5; i++) {
        statsService.recordSongPlayed({
            title: `Song ${i}`,
            requester: 'User 1',
            content: `url${i}`
        });
    }
    for (let i = 0; i < 3; i++) {
        statsService.recordSongPlayed({
            title: `Song ${i + 5}`,
            requester: 'User 2',
            content: `url${i + 5}`
        });
    }
    
    const topRequesters = statsService.getTopRequesters(10);
    expect(Array.isArray(topRequesters)).toBe(true);
    expect(topRequesters.length).toBeGreaterThan(0);
});

test('getTopArtists should return top artists', () => {
    // Record songs from different artists
    statsService.recordSongPlayed({
        title: 'Artist A - Song 1',
        requester: 'User',
        content: 'url1'
    });
    statsService.recordSongPlayed({
        title: 'Artist A - Song 2',
        requester: 'User',
        content: 'url2'
    });
    statsService.recordSongPlayed({
        title: 'Artist B - Song 1',
        requester: 'User',
        content: 'url3'
    });
    
    const topArtists = statsService.getTopArtists(10);
    expect(Array.isArray(topArtists)).toBe(true);
});

test('getTopChannels should return top channels', () => {
    statsService.recordSongPlayed({
        title: 'Song 1',
        requester: 'User',
        content: 'url1',
        channel: 'Channel A'
    });
    statsService.recordSongPlayed({
        title: 'Song 2',
        requester: 'User',
        content: 'url2',
        channel: 'Channel A'
    });
    statsService.recordSongPlayed({
        title: 'Song 3',
        requester: 'User',
        content: 'url3',
        channel: 'Channel B'
    });
    
    const topChannels = statsService.getTopChannels(10);
    expect(Array.isArray(topChannels)).toBe(true);
});

test('getHourlyDistribution should return hourly play distribution', () => {
    statsService.recordSongPlayed({
        title: 'Song 1',
        requester: 'User',
        content: 'url1'
    });
    
    const distribution = statsService.getHourlyDistribution();
    expect(typeof distribution).toBe('object');
});

test('resetStats should reset statistics', () => {
    // Record some songs
    statsService.recordSongPlayed({
        title: 'Song 1',
        requester: 'User',
        content: 'url1'
    });
    
    const statsBefore = statsService.getStats();
    expect(statsBefore.songsPlayed).toBeGreaterThan(0);
    
    statsService.resetStats();
    
    const statsAfter = statsService.getStats();
    expect(statsAfter.songsPlayed).toBe(0);
});

test('recalculateFromHistory should return current stats', () => {
    statsService.recordSongPlayed({
        title: 'Song 1',
        requester: 'User',
        content: 'url1'
    });
    
    const stats = statsService.recalculateFromHistory();
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty('songsPlayed');
});

test('getHistory should format history entries correctly', () => {
    statsService.recordSongPlayed({
        title: 'Test Song',
        artist: 'Test Artist',
        requester: 'Test User',
        content: 'url1',
        duration: 180000,
        thumbnailUrl: 'https://example.com/thumb.jpg'
    });
    
    const history = statsService.getHistory(1);
    expect(history[0]).toHaveProperty('id');
    expect(history[0]).toHaveProperty('title');
    expect(history[0]).toHaveProperty('artist');
    expect(history[0]).toHaveProperty('requester');
    expect(history[0]).toHaveProperty('thumbnailUrl');
    expect(history[0]).toHaveProperty('duration');
    expect(history[0]).toHaveProperty('playedAt');
    expect(typeof history[0].playedAt).toBe('number');
});

test('recordSongPlayed should convert thumbnail path to URL', () => {
    statsService.recordSongPlayed({
        title: 'Song',
        requester: 'User',
        content: 'url1',
        thumbnail: '/path/to/thumb.jpg'
    });
    
    const history = statsService.getHistory(1);
    // Thumbnail should be converted to URL if possible
    expect(history[0].thumbnailUrl).toBeDefined();
});

