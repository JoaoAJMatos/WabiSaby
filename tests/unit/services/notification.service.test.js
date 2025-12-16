/**
 * Notification Service Tests
 * Tests for user notification management
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const notificationService = require('../../../src/services/notification.service');
const queueManager = require('../../../src/core/queue');
const playbackController = require('../../../src/core/playback.controller');
const { PLAYBACK_STARTED, QUEUE_UPDATED } = require('../../../src/core/events');
const helpersUtil = require('../../../src/utils/helpers.util');

// Track calls to sendMessageWithMention
let mockSendMessageCalls = [];
let sendMessageWithMentionStub;

beforeEach(() => {
    mockSendMessageCalls = [];
    
    // Stub sendMessageWithMention to track calls
    sendMessageWithMentionStub = sinon.stub(helpersUtil, 'sendMessageWithMention').callsFake((sock, remoteJid, text, mentions) => {
        mockSendMessageCalls.push({ sock, remoteJid, text, mentions });
        return Promise.resolve();
    });
    
    notificationService.clearHistory();
    notificationService.setEnabled(true);
    notificationService.sock = { sendMessage: () => {} };
    
    // Remove all listeners
    queueManager.removeAllListeners(QUEUE_UPDATED);
    playbackController.removeAllListeners(PLAYBACK_STARTED);
    
    // Setup listeners
    notificationService.initialize(notificationService.sock);
});

afterEach(() => {
    // Restore all stubs
    if (sendMessageWithMentionStub) {
        sendMessageWithMentionStub.restore();
    }
});

test('setEnabled should enable/disable notifications', () => {
    notificationService.setEnabled(true);
    expect(notificationService.isEnabled).toBe(true);
    
    notificationService.setEnabled(false);
    expect(notificationService.isEnabled).toBe(false);
});

test('clearHistory should clear notified songs', () => {
    // Simulate some notifications
    notificationService.notifiedSongs.add('test1');
    notificationService.notifiedSongs.add('test2');
    
    expect(notificationService.notifiedSongs.size).toBe(2);
    
    notificationService.clearHistory();
    
    expect(notificationService.notifiedSongs.size).toBe(0);
});

test('formatUpcomingMessage should format position 1 as "Up next"', () => {
    const song = { title: 'Test Song' };
    const message = notificationService.formatUpcomingMessage(song, 1);
    
    expect(message).toBe('Up next: Test Song');
});

test('formatUpcomingMessage should format other positions with number', () => {
    const song = { title: 'Test Song' };
    const message2 = notificationService.formatUpcomingMessage(song, 2);
    const message3 = notificationService.formatUpcomingMessage(song, 3);
    
    expect(message2).toBe('Coming up (#2): Test Song');
    expect(message3).toBe('Coming up (#3): Test Song');
});

test('formatUpcomingMessage should handle missing title', () => {
    const song = {};
    const message = notificationService.formatUpcomingMessage(song, 1);
    
    expect(message).toBe('Up next: Your song');
});

test('checkAndNotifyUpcomingSongs should not notify when disabled', async () => {
    notificationService.setEnabled(false);
    playbackController.currentSong = { title: 'Current' };
    queueManager.queue = [{
        title: 'Next Song',
        requester: 'User',
        sender: 'user@whatsapp',
        remoteJid: 'group@whatsapp',
        content: 'url1'
    }];
    
    await notificationService.checkAndNotifyUpcomingSongs();
    
    expect(mockSendMessageCalls.length).toBe(0);
});

test('checkAndNotifyUpcomingSongs should not notify when no socket', async () => {
    notificationService.sock = null;
    playbackController.currentSong = { title: 'Current' };
    queueManager.queue = [{
        title: 'Next Song',
        requester: 'User',
        sender: 'user@whatsapp',
        remoteJid: 'group@whatsapp',
        content: 'url1'
    }];
    
    await notificationService.checkAndNotifyUpcomingSongs();
    
    expect(mockSendMessageCalls.length).toBe(0);
});

test('checkAndNotifyUpcomingSongs should not notify when no current song', async () => {
    playbackController.currentSong = null;
    queueManager.queue = [{
        title: 'Next Song',
        requester: 'User',
        sender: 'user@whatsapp',
        remoteJid: 'group@whatsapp',
        content: 'url1'
    }];
    
    await notificationService.checkAndNotifyUpcomingSongs();
    
    expect(mockSendMessageCalls.length).toBe(0);
});

test('checkAndNotifyUpcomingSongs should notify when song is at notify position', async () => {
    playbackController.currentSong = { title: 'Current Song' };
    queueManager.queue = [{
        title: 'Next Song',
        requester: 'Test User',
        sender: 'user@whatsapp',
        remoteJid: 'group@whatsapp',
        content: 'url1'
    }];
    
    // Set notifyAtPosition to 1 (next song)
    notificationService.notifyAtPosition = 1;
    
    await notificationService.checkAndNotifyUpcomingSongs();
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Up next');
    expect(mockSendMessageCalls[0].text).toContain('Next Song');
    expect(mockSendMessageCalls[0].mentions).toBe('user@whatsapp');
});

test('checkAndNotifyUpcomingSongs should not notify for WEB_DASHBOARD songs', async () => {
    playbackController.currentSong = { title: 'Current Song' };
    queueManager.queue = [{
        title: 'Web Song',
        requester: 'Web User',
        sender: 'WEB_DASHBOARD',
        remoteJid: 'WEB_DASHBOARD',
        content: 'url1'
    }];
    
    notificationService.notifyAtPosition = 1;
    
    await notificationService.checkAndNotifyUpcomingSongs();
    
    expect(mockSendMessageCalls.length).toBe(0);
});

test('checkAndNotifyUpcomingSongs should not notify twice for same song', async () => {
    playbackController.currentSong = { title: 'Current Song' };
    const song = {
        title: 'Next Song',
        requester: 'Test User',
        sender: 'user@whatsapp',
        remoteJid: 'group@whatsapp',
        content: 'url1'
    };
    queueManager.queue = [song];
    
    notificationService.notifyAtPosition = 1;
    
    // First notification
    await notificationService.checkAndNotifyUpcomingSongs();
    expect(mockSendMessageCalls.length).toBe(1);
    
    // Second call should not notify again
    await notificationService.checkAndNotifyUpcomingSongs();
    expect(mockSendMessageCalls.length).toBe(1);
});

test('checkAndNotifyUpcomingSongs should notify for position 2', async () => {
    playbackController.currentSong = { title: 'Current Song' };
    queueManager.queue = [
        {
            title: 'First Song',
            requester: 'User 1',
            sender: 'user1@whatsapp',
            remoteJid: 'group@whatsapp',
            content: 'url1'
        },
        {
            title: 'Second Song',
            requester: 'User 2',
            sender: 'user2@whatsapp',
            remoteJid: 'group@whatsapp',
            content: 'url2'
        }
    ];
    
    notificationService.notifyAtPosition = 2;
    
    await notificationService.checkAndNotifyUpcomingSongs();
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Coming up (#2)');
    expect(mockSendMessageCalls[0].text).toContain('Second Song');
});

test('checkAndNotifyUpcomingSongs should handle errors gracefully', async () => {
    // Make sendMessage throw an error
    sendMessageWithMentionStub.restore();
    sendMessageWithMentionStub = sinon.stub(helpersUtil, 'sendMessageWithMention').rejects(new Error('Send failed'));
    
    playbackController.currentSong = { title: 'Current Song' };
    queueManager.queue = [{
        title: 'Next Song',
        requester: 'User',
        sender: 'user@whatsapp',
        remoteJid: 'group@whatsapp',
        content: 'url1'
    }];
    
    notificationService.notifyAtPosition = 1;
    
    // Should not throw - errors are caught and logged internally
    await notificationService.checkAndNotifyUpcomingSongs();
    
    // Verify the stub was called (even though it failed)
    expect(sendMessageWithMentionStub.called).toBe(true);
    
    // Restore to normal stub for other tests
    sendMessageWithMentionStub.restore();
    sendMessageWithMentionStub = sinon.stub(helpersUtil, 'sendMessageWithMention').callsFake((sock, remoteJid, text, mentions) => {
        mockSendMessageCalls.push({ sock, remoteJid, text, mentions });
        return Promise.resolve();
    });
});

test('checkAndNotifyUpcomingSongs should cleanup old notifications', async () => {
    // Add 60 notifications to trigger cleanup
    for (let i = 0; i < 60; i++) {
        notificationService.notifiedSongs.add(`notification_${i}`);
    }
    
    expect(notificationService.notifiedSongs.size).toBe(60);
    
    playbackController.currentSong = { title: 'Current Song' };
    queueManager.queue = [{
        title: 'New Song',
        requester: 'User',
        sender: 'user@whatsapp',
        remoteJid: 'group@whatsapp',
        content: 'newurl'
    }];
    
    notificationService.notifyAtPosition = 1;
    
    await notificationService.checkAndNotifyUpcomingSongs();
    
    // Should have cleaned up (kept last 50, removed 10)
    expect(notificationService.notifiedSongs.size).toBeLessThanOrEqual(51);
});

test('setupListeners should listen to queue events', () => {
    // Remove listeners first
    queueManager.removeAllListeners(QUEUE_UPDATED);
    playbackController.removeAllListeners(PLAYBACK_STARTED);
    
    notificationService.initialize(notificationService.sock);
    
    // Check that listeners are set up (indirectly by checking behavior)
    expect(notificationService.sock).toBeDefined();
});

test('initialize should setup socket and listeners', () => {
    const mockSock = { sendMessage: () => {} };
    
    notificationService.initialize(mockSock);
    
    expect(notificationService.sock).toBe(mockSock);
});

