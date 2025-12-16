/**
 * Ping Command Tests
 * Tests for !ping command using dependency injection
 */

const { test, expect, beforeEach } = require('bun:test');
const { createDeps } = require('../../../src/commands/dependencies');
const { pingCommand, getPendingConfirmations, removePendingConfirmation } = require('../../../src/commands/implementations/ping');

// Mock sendMessageWithMention
let mockSendMessageCalls = [];
const mockSendMessageWithMention = async (sock, remoteJid, text, mentions) => {
    mockSendMessageCalls.push({ sock, remoteJid, text, mentions });
};

const mockSock = { 
    sendMessage: () => {},
    groupMetadata: async () => ({ subject: 'Test Group' })
};

const mockGroupMsg = {
    key: {
        remoteJid: 'group@g.us',
        participant: 'user@whatsapp',
        id: 'msg123'
    },
    pushName: 'Test User'
};

const mockUserMsg = {
    key: {
        remoteJid: 'user@whatsapp',
        id: 'msg123'
    },
    pushName: 'Test User'
};

beforeEach(() => {
    mockSendMessageCalls = [];
    // Clear pending confirmations
    removePendingConfirmation('group@g.us');
});

test('ping command should fail in non-group chat', async () => {
    const testDeps = createDeps({
        groupsService: {
            isGroupMonitored: () => false
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, warn: () => {} }
    });
    
    await pingCommand(mockSock, mockUserMsg, testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('only works in groups');
});

test('ping command should fail if group already monitored', async () => {
    const testDeps = createDeps({
        groupsService: {
            isGroupMonitored: () => true
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, warn: () => {} }
    });
    
    await pingCommand(mockSock, mockGroupMsg, testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('already being monitored');
});

test('ping command should fail if pending confirmation exists', async () => {
    const testDeps = createDeps({
        groupsService: {
            isGroupMonitored: () => false
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, warn: () => {} }
    });
    
    // First call should succeed
    await pingCommand(mockSock, mockGroupMsg, testDeps);
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Request to add');
    
    // Second call should fail
    mockSendMessageCalls = [];
    await pingCommand(mockSock, mockGroupMsg, testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('already pending');
});

test('ping command should create pending confirmation', async () => {
    const testDeps = createDeps({
        groupsService: {
            isGroupMonitored: () => false
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, warn: () => {} }
    });
    
    await pingCommand(mockSock, mockGroupMsg, testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Request to add');
    expect(mockSendMessageCalls[0].text).toContain('web dashboard');
    
    const pending = getPendingConfirmations();
    expect(pending.length).toBe(1);
    expect(pending[0].groupId).toBe('group@g.us');
    expect(pending[0].senderId).toBe('user@whatsapp');
    expect(pending[0].senderName).toBe('Test User');
});

test('ping command should fetch group metadata', async () => {
    let metadataCalled = false;
    mockSock.groupMetadata = async (jid) => {
        metadataCalled = true;
        expect(jid).toBe('group@g.us');
        return { subject: 'Fetched Group Name' };
    };
    
    const testDeps = createDeps({
        groupsService: {
            isGroupMonitored: () => false
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, warn: () => {} }
    });
    
    await pingCommand(mockSock, mockGroupMsg, testDeps);
    
    expect(metadataCalled).toBe(true);
    const pending = getPendingConfirmations();
    expect(pending[0].groupName).toBe('Fetched Group Name');
});

test('ping command should handle group metadata fetch failure', async () => {
    mockSock.groupMetadata = async () => {
        throw new Error('Metadata fetch failed');
    };
    
    const testDeps = createDeps({
        groupsService: {
            isGroupMonitored: () => false
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, warn: () => {} }
    });
    
    await pingCommand(mockSock, mockGroupMsg, testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Request to add');
    
    const pending = getPendingConfirmations();
    expect(pending[0].groupName).toBe('Unknown Group');
});

test('ping command should use pushName as sender name', async () => {
    const testDeps = createDeps({
        groupsService: {
            isGroupMonitored: () => false
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, warn: () => {} }
    });
    
    await pingCommand(mockSock, mockGroupMsg, testDeps);
    
    const pending = getPendingConfirmations();
    expect(pending[0].senderName).toBe('Test User');
});

test('ping command should use "Unknown User" when no pushName', async () => {
    const msgWithoutName = {
        ...mockGroupMsg,
        pushName: undefined
    };
    
    const testDeps = createDeps({
        groupsService: {
            isGroupMonitored: () => false
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, warn: () => {} }
    });
    
    await pingCommand(mockSock, msgWithoutName, testDeps);
    
    const pending = getPendingConfirmations();
    expect(pending[0].senderName).toBe('Unknown User');
});

test('ping command should mention sender', async () => {
    const testDeps = createDeps({
        groupsService: {
            isGroupMonitored: () => false
        },
        sendMessageWithMention: mockSendMessageWithMention,
        logger: { info: () => {}, warn: () => {} }
    });
    
    await pingCommand(mockSock, mockGroupMsg, testDeps);
    
    expect(mockSendMessageCalls[0].mentions).toBe('user@whatsapp');
});
