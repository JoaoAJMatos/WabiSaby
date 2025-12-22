/**
 * Queue Command Tests
 * Tests for !queue command using dependency injection
 */

const { test, expect, beforeEach } = require('bun:test');
const { createDeps } = require('../../../src/commands/dependencies');
const queueCommand = require('../../../src/commands/implementations/queue');

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

test('queue command should display queue with current song', async () => {
    const testDeps = createDeps({
        queueManager: {
            getQueue: () => [
                { title: 'Song 1', content: 'url1' },
                { title: 'Song 2', content: 'url2' }
            ]
        },
        playbackController: {
            getCurrent: () => ({
                title: 'Current Song',
                content: 'url1'
            })
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await queueCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    const response = mockSendMessageCalls[0].text;
    expect(response).toContain('Queue');
    expect(response).toContain('Current Song');
    expect(response).toContain('Song 1');
    expect(response).toContain('Song 2');
    expect(response).toContain('1.');
    expect(response).toContain('2.');
});

test('queue command should display queue without current song', async () => {
    const testDeps = createDeps({
        queueManager: {
            getQueue: () => [
                { title: 'Song 1', content: 'url1' }
            ]
        },
        playbackController: {
            getCurrent: () => null
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await queueCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    const response = mockSendMessageCalls[0].text;
    expect(response).toContain('Queue');
    expect(response).not.toContain('▶️');
    expect(response).toContain('Song 1');
});

test('queue command should display empty queue', async () => {
    const testDeps = createDeps({
        queueManager: {
            getQueue: () => []
        },
        playbackController: {
            getCurrent: () => null
        },
        sendMessageWithMention: mockSendMessageWithMention,
        i18n: (key, lang, params) => {
            if (key === 'commands.queue.title') {
                return 'Queue\n';
            }
            if (key === 'commands.queue.empty') {
                return 'Empty';
            }
            return key;
        }
    });
    
    await queueCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    const response = mockSendMessageCalls[0].text;
    expect(response).toContain('Queue');
    expect(response).toContain('Empty');
});

test('queue command should handle songs without title', async () => {
    const testDeps = createDeps({
        queueManager: {
            getQueue: () => [
                { content: 'url2' }
            ]
        },
        playbackController: {
            getCurrent: () => ({
                content: 'url1'
            })
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await queueCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    const response = mockSendMessageCalls[0].text;
    expect(response).toContain('url1');
    expect(response).toContain('url2');
});

test('queue command should mention sender', async () => {
    const testDeps = createDeps({
        queueManager: {
            getQueue: () => []
        },
        playbackController: {
            getCurrent: () => null
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await queueCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls[0].mentions).toBe('user@whatsapp');
});
