/**
 * Skip Command Tests
 * Tests for !skip command using dependency injection
 */

const { test, expect, beforeEach } = require('bun:test');
const { createDeps } = require('../../../src/commands/dependencies');
const skipCommand = require('../../../src/commands/implementations/skip');

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

test('skip command should deny when nothing is playing', async () => {
    const testDeps = createDeps({
        queueManager: {
            checkPriority: () => false
        },
        playbackController: {
            getCurrent: () => null,
            skip: () => {}
        },
        sendMessageWithMention: mockSendMessageWithMention,
        i18n: (key, lang, params) => {
            if (key === 'commands.skip.nothingPlaying') {
                return 'Nothing is playing.';
            }
            return key;
        }
    });
    
    await skipCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toBe('Nothing is playing.');
    expect(mockSendMessageCalls[0].mentions).toBe('user@whatsapp');
});

test('skip command should allow skip by requester', async () => {
    let skipCalled = false;
    
    const testDeps = createDeps({
        queueManager: {
            checkPriority: () => false
        },
        playbackController: {
            getCurrent: () => ({
                title: 'Current Song',
                sender: 'user@whatsapp'
            }),
            skip: () => {
                skipCalled = true;
                return true;
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        i18n: (key, lang, params) => {
            if (key === 'commands.skip.skipped') {
                return 'Skipped';
            }
            return key;
        }
    });
    
    await skipCommand(mockSock, mockMsg, [], testDeps);
    
    expect(skipCalled).toBe(true);
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toBe('Skipped');
});

test('skip command should allow skip by VIP', async () => {
    let skipCalled = false;
    
    const testDeps = createDeps({
        queueManager: {
            checkPriority: () => true // User is VIP
        },
        playbackController: {
            getCurrent: () => ({
                title: 'Current Song',
                sender: 'other@whatsapp'
            }),
            skip: () => {
                skipCalled = true;
                return true;
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        i18n: (key, lang, params) => {
            if (key === 'commands.skip.skipped') {
                return 'Skipped';
            }
            return key;
        }
    });
    
    await skipCommand(mockSock, mockMsg, [], testDeps);
    
    expect(skipCalled).toBe(true);
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toBe('Skipped');
});

test('skip command should deny skip by non-VIP non-requester', async () => {
    let skipCalled = false;
    
    const testDeps = createDeps({
        queueManager: {
            checkPriority: () => false // Not VIP
        },
        playbackController: {
            getCurrent: () => ({
                title: 'Current Song',
                sender: 'other@whatsapp'
            }),
            skip: () => {
                skipCalled = true;
                return true;
            }
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await skipCommand(mockSock, mockMsg, [], testDeps);
    
    expect(skipCalled).toBe(false);
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('You can only skip your own songs');
    expect(mockSendMessageCalls[0].text).toContain('VIPs can skip any song');
});

test('skip command should work with any args', async () => {
    const testDeps = createDeps({
        queueManager: {
            checkPriority: () => false
        },
        playbackController: {
            getCurrent: () => ({
                title: 'Current Song',
                sender: 'user@whatsapp'
            }),
            skip: () => true
        },
        sendMessageWithMention: mockSendMessageWithMention,
        i18n: (key, lang, params) => {
            if (key === 'commands.skip.skipped') {
                return 'Skipped';
            }
            return key;
        }
    });
    
    await skipCommand(mockSock, mockMsg, ['extra', 'args'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toBe('Skipped');
});
