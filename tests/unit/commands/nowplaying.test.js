/**
 * Now Playing Command Tests
 * Tests for !np command using dependency injection
 */

const { test, expect, beforeEach } = require('bun:test');
const { createDeps } = require('../../../src/commands/dependencies');
const nowPlayingCommand = require('../../../src/commands/implementations/nowplaying');

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

test('nowplaying command should show current song', async () => {
    const testDeps = createDeps({
        playbackController: {
            getCurrent: () => ({
                title: 'Current Song',
                content: 'url1'
            })
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await nowPlayingCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('▶️');
    expect(mockSendMessageCalls[0].text).toContain('Current Song');
    expect(mockSendMessageCalls[0].mentions).toBe('user@whatsapp');
});

test('nowplaying command should show message when nothing playing', async () => {
    const testDeps = createDeps({
        playbackController: {
            getCurrent: () => null
        },
        sendMessageWithMention: mockSendMessageWithMention,
        i18n: (key, lang, params) => {
            if (key === 'commands.nowPlaying.nothingPlaying') {
                return 'Nothing playing.';
            }
            return key;
        }
    });
    
    await nowPlayingCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toBe('Nothing playing.');
    expect(mockSendMessageCalls[0].mentions).toBe('user@whatsapp');
});

test('nowplaying command should handle song without title', async () => {
    const testDeps = createDeps({
        playbackController: {
            getCurrent: () => ({
                content: 'url1'
            })
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await nowPlayingCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('url1');
});

test('nowplaying command should work with any args', async () => {
    const testDeps = createDeps({
        playbackController: {
            getCurrent: () => ({
                title: 'Current Song'
            })
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await nowPlayingCommand(mockSock, mockMsg, ['extra', 'args'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Current Song');
});
