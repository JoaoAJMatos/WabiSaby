/**
 * Remove Command Tests
 * Tests for !remove command using dependency injection
 */

const { test, expect, beforeEach } = require('bun:test');
const { createDeps } = require('../../../src/commands/dependencies');
const removeCommand = require('../../../src/commands/implementations/remove');

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

test('remove command should remove song with valid index', async () => {
    const removedSong = {
        title: 'Removed Song',
        content: 'url1'
    };
    
    const testDeps = createDeps({
        queueManager: {
            remove: (index) => {
                expect(index).toBe(0); // 1 - 1 = 0
                return removedSong;
            }
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await removeCommand(mockSock, mockMsg, ['1'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Removed');
    expect(mockSendMessageCalls[0].text).toContain('Removed Song');
    expect(mockSendMessageCalls[0].mentions).toBe('user@whatsapp');
});

test('remove command should show error for invalid index (NaN)', async () => {
    const testDeps = createDeps({
        queueManager: {
            remove: () => null
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await removeCommand(mockSock, mockMsg, ['invalid'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    // Command shows usage when index is NaN
    expect(mockSendMessageCalls[0].text).toContain('Usage');
    expect(mockSendMessageCalls[0].text).toContain('!remove');
});

test('remove command should show error for out of range index', async () => {
    const testDeps = createDeps({
        queueManager: {
            remove: () => null
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await removeCommand(mockSock, mockMsg, ['10'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Invalid index');
});

test('remove command should show usage when no args', async () => {
    const testDeps = createDeps({
        queueManager: {
            remove: () => null
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await removeCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Usage');
    expect(mockSendMessageCalls[0].text).toContain('!remove');
});

test('remove command should handle song without title', async () => {
    const removedSong = {
        content: 'url1'
    };
    
    const testDeps = createDeps({
        queueManager: {
            remove: () => removedSong
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await removeCommand(mockSock, mockMsg, ['1'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('url1');
});

test('remove command should convert 1-based index to 0-based', async () => {
    let capturedIndex = null;
    
    const testDeps = createDeps({
        queueManager: {
            remove: (index) => {
                capturedIndex = index;
                return { title: 'Song' };
            }
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await removeCommand(mockSock, mockMsg, ['5'], testDeps);
    
    expect(capturedIndex).toBe(4); // 5 - 1 = 4
});
