/**
 * Help Command Tests
 * Tests for !help command using dependency injection
 */

const { test, expect, beforeEach } = require('bun:test');
const { createDeps } = require('../../../src/commands/dependencies');
const helpCommand = require('../../../src/commands/implementations/help');

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

test('help command should send help text', async () => {
    const testDeps = createDeps({
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await helpCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Commands');
    expect(mockSendMessageCalls[0].remoteJid).toBe('group@g.us');
    expect(mockSendMessageCalls[0].mentions).toBe('user@whatsapp');
});

test('help text should contain all commands', async () => {
    const testDeps = createDeps({
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await helpCommand(mockSock, mockMsg, [], testDeps);
    
    const helpText = mockSendMessageCalls[0].text;
    expect(helpText).toContain('!play');
    expect(helpText).toContain('!skip');
    expect(helpText).toContain('!queue');
    expect(helpText).toContain('!remove');
    expect(helpText).toContain('!np');
    expect(helpText).toContain('!notifications');
    expect(helpText).toContain('!playlist');
    expect(helpText).toContain('!ping');
    expect(helpText).toContain('!help');
});

test('help command should work with any args', async () => {
    const testDeps = createDeps({
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await helpCommand(mockSock, mockMsg, ['extra', 'args'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Commands');
});
