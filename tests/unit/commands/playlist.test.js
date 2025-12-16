/**
 * Playlist Command Tests
 * Tests for !playlist command using dependency injection
 */

const { test, expect, beforeEach } = require('bun:test');
const { createDeps } = require('../../../src/commands/dependencies');
const playlistCommand = require('../../../src/commands/implementations/playlist');

// Mock sendMessageWithMention
let mockSendMessageCalls = [];
const mockSendMessageWithMention = async (sock, remoteJid, text, mentions) => {
    mockSendMessageCalls.push({ sock, remoteJid, text, mentions });
};

const mockSock = { sendMessage: () => {} };
const mockMsg = {
    key: {
        remoteJid: 'group@g.us',
        participant: 'user@whatsapp',
        id: 'msg123'
    },
    pushName: 'Test User'
};

beforeEach(() => {
    mockSendMessageCalls = [];
});

test('playlist command should deny non-VIP users', async () => {
    const testDeps = createDeps({
        checkPriority: () => false,
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await playlistCommand(mockSock, mockMsg, ['https://spotify.com/playlist/123'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Only VIP users can add playlists');
});

test('playlist command should show usage when no URL', async () => {
    const testDeps = createDeps({
        checkPriority: () => true,
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await playlistCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Usage');
    expect(mockSendMessageCalls[0].text).toContain('!playlist');
});

test('playlist command should reject invalid playlist URL', async () => {
    const testDeps = createDeps({
        checkPriority: () => true,
        isPlaylistUrl: () => false,
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await playlistCommand(mockSock, mockMsg, ['https://invalid.com'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Invalid playlist URL');
});

test('playlist command should handle empty playlist', async () => {
    const testDeps = createDeps({
        checkPriority: () => true,
        isPlaylistUrl: () => true,
        getPlaylistTracks: async () => [],
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await playlistCommand(mockSock, mockMsg, ['https://spotify.com/playlist/123'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('No tracks found in playlist');
});

test('playlist command should add tracks from playlist', async () => {
    const addedSongs = [];
    
    const testDeps = createDeps({
        checkPriority: () => true,
        isPlaylistUrl: () => true,
        getPlaylistTracks: async () => [
            { url: 'https://youtube.com/watch?v=1', title: 'Song 1' },
            { url: 'https://youtube.com/watch?v=2', title: 'Song 2' },
            { url: 'https://youtube.com/watch?v=3', title: 'Song 3' }
        ],
        queueManager: {
            add: (song) => {
                addedSongs.push(song);
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playlistCommand(mockSock, mockMsg, ['https://spotify.com/playlist/123'], testDeps);
    
    expect(addedSongs.length).toBe(3);
    expect(addedSongs[0].title).toBe('Song 1');
    expect(addedSongs[1].title).toBe('Song 2');
    expect(addedSongs[2].title).toBe('Song 3');
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Added 3 tracks');
});

test('playlist command should search YouTube for Spotify tracks without URL', async () => {
    let searchQuery = null;
    const addedSongs = [];
    
    const testDeps = createDeps({
        checkPriority: () => true,
        isPlaylistUrl: () => true,
        getPlaylistTracks: async () => [
            { searchQuery: 'Artist - Song', title: 'Song' }
        ],
        searchYouTube: async (query) => {
            searchQuery = query;
            return {
                url: 'https://youtube.com/watch?v=found',
                title: 'Found Song',
                artist: 'Found Artist'
            };
        },
        queueManager: {
            add: (song) => {
                addedSongs.push(song);
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playlistCommand(mockSock, mockMsg, ['https://spotify.com/playlist/123'], testDeps);
    
    expect(searchQuery).toBe('Artist - Song');
    expect(addedSongs.length).toBe(1);
    expect(addedSongs[0].content).toBe('https://youtube.com/watch?v=found');
    expect(addedSongs[0].title).toBe('Found Song');
});

test('playlist command should handle partial failures', async () => {
    const addedSongs = [];
    
    const testDeps = createDeps({
        checkPriority: () => true,
        isPlaylistUrl: () => true,
        getPlaylistTracks: async () => [
            { url: 'https://youtube.com/watch?v=1', title: 'Song 1' },
            { url: null, searchQuery: 'Invalid Song' },
            { url: 'https://youtube.com/watch?v=3', title: 'Song 3' }
        ],
        searchYouTube: async () => {
            throw new Error('Search failed');
        },
        queueManager: {
            add: (song) => {
                addedSongs.push(song);
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playlistCommand(mockSock, mockMsg, ['https://spotify.com/playlist/123'], testDeps);
    
    expect(addedSongs.length).toBe(2); // 2 successful, 1 failed
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Added 2 tracks');
    expect(mockSendMessageCalls[0].text).toContain('1 failed');
});

test('playlist command should handle playlist service errors', async () => {
    const testDeps = createDeps({
        checkPriority: () => true,
        isPlaylistUrl: () => true,
        getPlaylistTracks: async () => {
            throw new Error('Playlist service error');
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playlistCommand(mockSock, mockMsg, ['https://spotify.com/playlist/123'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Failed to process playlist');
    expect(mockSendMessageCalls[0].text).toContain('Playlist service error');
});

test('playlist command should use pushName as requester', async () => {
    const addedSongs = [];
    
    const testDeps = createDeps({
        checkPriority: () => true,
        isPlaylistUrl: () => true,
        getPlaylistTracks: async () => [
            { url: 'https://youtube.com/watch?v=1', title: 'Song 1' }
        ],
        queueManager: {
            add: (song) => {
                addedSongs.push(song);
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playlistCommand(mockSock, mockMsg, ['https://spotify.com/playlist/123'], testDeps);
    
    expect(addedSongs[0].requester).toBe('Test User');
});

test('playlist command should use "VIP" as requester when no pushName', async () => {
    const msgWithoutName = {
        ...mockMsg,
        pushName: undefined
    };
    
    const addedSongs = [];
    
    const testDeps = createDeps({
        checkPriority: () => true,
        isPlaylistUrl: () => true,
        getPlaylistTracks: async () => [
            { url: 'https://youtube.com/watch?v=1', title: 'Song 1' }
        ],
        queueManager: {
            add: (song) => {
                addedSongs.push(song);
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playlistCommand(mockSock, msgWithoutName, ['https://spotify.com/playlist/123'], testDeps);
    
    expect(addedSongs[0].requester).toBe('VIP');
});
