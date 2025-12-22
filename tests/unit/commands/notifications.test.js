/**
 * Notifications Command Tests
 * Tests for !notifications command using dependency injection
 */

const { test, expect, beforeEach } = require('bun:test');
const { createDeps } = require('../../../src/commands/dependencies');
const notificationsCommand = require('../../../src/commands/implementations/notifications');

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

test('notifications command should show status when no args', async () => {
    const testDeps = createDeps({
        notificationService: {
            isEnabled: true
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await notificationsCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Notifications');
    expect(mockSendMessageCalls[0].text).toContain('enabled');
    expect(mockSendMessageCalls[0].mentions).toBe('user@whatsapp');
});

test('notifications command should show disabled status', async () => {
    const testDeps = createDeps({
        notificationService: {
            isEnabled: false
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await notificationsCommand(mockSock, mockMsg, [], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('disabled');
});

test('notifications command should enable with "on"', async () => {
    let setUserPreferenceCalled = false;
    let setUserPreferenceValue = null;
    let setUserPreferenceUserId = null;
    
    const testDeps = createDeps({
        notificationService: {
            isEnabled: false
        },
        sendMessageWithMention: mockSendMessageWithMention,
        dbService: {
            getUserNotificationPreference: () => true,
            setUserNotificationPreference: (userId, value) => {
                setUserPreferenceCalled = true;
                setUserPreferenceValue = value;
                setUserPreferenceUserId = userId;
            }
        },
        i18n: (key, lang, params) => {
            if (key === 'commands.notifications.enabled') {
                return 'Notifications enabled';
            }
            return key;
        }
    });
    
    await notificationsCommand(mockSock, mockMsg, ['on'], testDeps);
    
    expect(setUserPreferenceCalled).toBe(true);
    expect(setUserPreferenceValue).toBe(true);
    expect(setUserPreferenceUserId).toBe('user@whatsapp');
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Notifications enabled');
});

test('notifications command should enable with "enable"', async () => {
    let setUserPreferenceCalled = false;
    
    const testDeps = createDeps({
        notificationService: {
            isEnabled: false
        },
        sendMessageWithMention: mockSendMessageWithMention,
        dbService: {
            getUserNotificationPreference: () => true,
            setUserNotificationPreference: () => {
                setUserPreferenceCalled = true;
            }
        },
        i18n: (key, lang, params) => {
            if (key === 'commands.notifications.enabled') {
                return 'Notifications enabled';
            }
            return key;
        }
    });
    
    await notificationsCommand(mockSock, mockMsg, ['enable'], testDeps);
    
    expect(setUserPreferenceCalled).toBe(true);
    expect(mockSendMessageCalls[0].text).toContain('enabled');
});

test('notifications command should disable with "off"', async () => {
    let setUserPreferenceCalled = false;
    let setUserPreferenceValue = null;
    
    const testDeps = createDeps({
        notificationService: {
            isEnabled: true
        },
        sendMessageWithMention: mockSendMessageWithMention,
        dbService: {
            getUserNotificationPreference: () => true,
            setUserNotificationPreference: (userId, value) => {
                setUserPreferenceCalled = true;
                setUserPreferenceValue = value;
            }
        },
        i18n: (key, lang, params) => {
            if (key === 'commands.notifications.disabled') {
                return 'Notifications disabled';
            }
            return key;
        }
    });
    
    await notificationsCommand(mockSock, mockMsg, ['off'], testDeps);
    
    expect(setUserPreferenceCalled).toBe(true);
    expect(setUserPreferenceValue).toBe(false);
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Notifications disabled');
});

test('notifications command should disable with "disable"', async () => {
    let setUserPreferenceCalled = false;
    
    const testDeps = createDeps({
        notificationService: {
            isEnabled: true
        },
        sendMessageWithMention: mockSendMessageWithMention,
        dbService: {
            getUserNotificationPreference: () => true,
            setUserNotificationPreference: () => {
                setUserPreferenceCalled = true;
            }
        },
        i18n: (key, lang, params) => {
            if (key === 'commands.notifications.disabled') {
                return 'Notifications disabled';
            }
            return key;
        }
    });
    
    await notificationsCommand(mockSock, mockMsg, ['disable'], testDeps);
    
    expect(setUserPreferenceCalled).toBe(true);
    expect(mockSendMessageCalls[0].text).toContain('disabled');
});

test('notifications command should clear history', async () => {
    let clearHistoryCalled = false;
    
    const testDeps = createDeps({
        notificationService: {
            isEnabled: true,
            clearHistory: () => {
                clearHistoryCalled = true;
            }
        },
        sendMessageWithMention: mockSendMessageWithMention,
        dbService: {
            getUserNotificationPreference: () => true,
            setUserNotificationPreference: () => {}
        },
        i18n: (key, lang, params) => {
            if (key === 'commands.notifications.historyCleared') {
                return 'Notification history cleared';
            }
            return key;
        }
    });
    
    await notificationsCommand(mockSock, mockMsg, ['clear'], testDeps);
    
    expect(clearHistoryCalled).toBe(true);
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Notification history cleared');
});

test('notifications command should show usage for invalid action', async () => {
    const testDeps = createDeps({
        notificationService: {
            isEnabled: true
        },
        sendMessageWithMention: mockSendMessageWithMention
    });
    
    await notificationsCommand(mockSock, mockMsg, ['invalid'], testDeps);
    
    expect(mockSendMessageCalls.length).toBe(1);
    expect(mockSendMessageCalls[0].text).toContain('Usage');
    expect(mockSendMessageCalls[0].text).toContain('!notifications');
});

test('notifications command should handle case insensitive actions', async () => {
    let setUserPreferenceCalled = false;
    
    const testDeps = createDeps({
        notificationService: {
            isEnabled: false
        },
        sendMessageWithMention: mockSendMessageWithMention,
        dbService: {
            getUserNotificationPreference: () => true,
            setUserNotificationPreference: () => {
                setUserPreferenceCalled = true;
            }
        },
        i18n: (key, lang, params) => {
            if (key === 'commands.notifications.enabled') {
                return 'Notifications enabled';
            }
            return key;
        }
    });
    
    await notificationsCommand(mockSock, mockMsg, ['ON'], testDeps);
    
    expect(setUserPreferenceCalled).toBe(true);
    expect(mockSendMessageCalls[0].text).toContain('enabled');
});
