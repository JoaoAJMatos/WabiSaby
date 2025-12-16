/**
 * Play Command Tests
 * Tests for !play command using dependency injection
 */

const { test, expect, beforeEach } = require('bun:test');
const { createDeps } = require('../../../src/commands/dependencies');
const playCommand = require('../../../src/commands/implementations/play');

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

test('play command should show usage when no input', async () => {
    const testDeps = createDeps({
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await playCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Usage');
    expect(mockSendMessageCalls[0].text).toContain('!play');
});

test('play command should handle YouTube URL', async () => {
    let addedSong = null;
    
    const testDeps = createDeps({
        isYouTubeUrl: () => true,
        isSpotifyUrl: () => false,
        getTrackInfo: async () => ({
            title: 'YouTube Song',
            artist: 'YouTube Artist'
        }),
        queueManager: {
            add: (song) => {
                addedSong = song;
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playCommand(mockSock, mockMsg, ['https://youtube.com/watch?v=test'], testDeps);
    
    expect(addedSong).not.toBeNull();
    expect(addedSong.content).toBe('https://youtube.com/watch?v=test');
    expect(addedSong.title).toBe('YouTube Song');
    expect(addedSong.artist).toBe('YouTube Artist');
    expect(addedSong.sender).toBe('user@whatsapp');
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Added');
    expect(mockSendMessageCalls[0].text).toContain('YouTube Song');
});

test('play command should handle Spotify URL', async () => {
    let addedSong = null;
    
    const testDeps = createDeps({
        isSpotifyUrl: () => true,
        isYouTubeUrl: () => false,
        getSpotifyMetadata: async () => ({
            title: 'Spotify Song',
            artist: 'Spotify Artist'
        }),
        queueManager: {
            add: (song) => {
                addedSong = song;
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playCommand(mockSock, mockMsg, ['https://open.spotify.com/track/123'], testDeps);
    
    expect(addedSong).not.toBeNull();
    expect(addedSong.title).toBe('Spotify Song');
    expect(addedSong.artist).toBe('Spotify Artist');
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Spotify Song');
});

test('play command should handle search query', async () => {
    let addedSong = null;
    
    const testDeps = createDeps({
        isSpotifyUrl: () => false,
        isYouTubeUrl: () => false,
        searchYouTube: async () => ({
            url: 'https://youtube.com/watch?v=found',
            title: 'Found Song',
            artist: 'Found Artist',
            matchScore: 0.9
        }),
        queueManager: {
            add: (song) => {
                addedSong = song;
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playCommand(mockSock, mockMsg, ['test', 'song'], testDeps);
    
    expect(addedSong).not.toBeNull();
    expect(addedSong.content).toBe('https://youtube.com/watch?v=found');
    expect(addedSong.title).toBe('Found Song');
    expect(addedSong.artist).toBe('Found Artist');
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Found Song');
});

test('play command should parse "Artist - Song" format', async () => {
    let searchQuery = null;
    let searchOptions = null;
    
    const testDeps = createDeps({
        isSpotifyUrl: () => false,
        isYouTubeUrl: () => false,
        searchYouTube: async (query, options) => {
            searchQuery = query;
            searchOptions = options;
            return {
                url: 'https://youtube.com/watch?v=found',
                title: 'Song Title',
                artist: 'Artist Name',
                matchScore: 0.9
            };
        },
        queueManager: { add: () => {} },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playCommand(mockSock, mockMsg, ['Artist', 'Name', '-', 'Song', 'Title'], testDeps);
    
    expect(searchQuery).toBe('Artist Name - Song Title');
    expect(searchOptions.expectedTitle).toBe('Song Title');
    expect(searchOptions.expectedArtist).toBe('Artist Name');
});

test('play command should handle Spotify metadata failure', async () => {
    const testDeps = createDeps({
        isSpotifyUrl: () => true,
        isYouTubeUrl: () => false,
        getSpotifyMetadata: async () => {
            throw new Error('Spotify API error');
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playCommand(mockSock, mockMsg, ['https://open.spotify.com/track/123'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Failed to resolve Spotify link');
});

test('play command should handle search failure', async () => {
    const testDeps = createDeps({
        isSpotifyUrl: () => false,
        isYouTubeUrl: () => false,
        searchYouTube: async () => {
            throw new Error('Search failed');
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playCommand(mockSock, mockMsg, ['nonexistent', 'song'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('No results found');
});

test('play command should use pushName as requester', async () => {
    let addedSong = null;
    
    const testDeps = createDeps({
        isYouTubeUrl: () => true,
        isSpotifyUrl: () => false,
        getTrackInfo: async () => ({
            title: 'Test Song',
            artist: 'Test Artist'
        }),
        queueManager: {
            add: (song) => {
                addedSong = song;
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playCommand(mockSock, mockMsg, ['https://youtube.com/watch?v=test'], testDeps);
    
    expect(addedSong.requester).toBe('Test User');
});

test('play command should use "User" as requester when no pushName', async () => {
    const msgWithoutName = {
        ...mockMsg,
        pushName: undefined
    };
    
    let addedSong = null;
    
    const testDeps = createDeps({
        isYouTubeUrl: () => true,
        isSpotifyUrl: () => false,
        getTrackInfo: async () => ({
            title: 'Test Song',
            artist: 'Test Artist'
        }),
        queueManager: {
            add: (song) => {
                addedSong = song;
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, error: () => {} }
    });
    
    await playCommand(mockSock, msgWithoutName, ['https://youtube.com/watch?v=test'], testDeps);
    
    expect(addedSong.requester).toBe('User');
});
