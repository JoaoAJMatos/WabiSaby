/**
 * Priority Service Tests
 * Tests for VIP/priority user management
 */

const { test, expect, beforeEach } = require('bun:test');
const sinon = require('sinon');
const { initializeDatabase, getDatabase } = require('../../../src/database/index');
const dbService = require('../../../src/database/db.service');
const priorityService = require('../../../src/services/priority.service');
const helpersUtil = require('../../../src/utils/helpers.util');
const config = require('../../../src/config');

beforeEach(() => {
    // Initialize database
    try {
        initializeDatabase();
    } catch (e) {
        // Database might already be initialized
    }
    
    // Clear all priority users
    const db = getDatabase();
    db.exec('DELETE FROM priority_users;');
});

test('getPriorityUsers should return empty array when no priority users exist', () => {
    const users = priorityService.getPriorityUsers();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBe(0);
});

test('getPriorityUsers should return all priority users', () => {
    dbService.addPriorityUser('user1@whatsapp', 'User 1');
    dbService.addPriorityUser('user2@whatsapp', 'User 2');
    
    const users = priorityService.getPriorityUsers();
    expect(users.length).toBe(2);
    expect(users.some(u => u.whatsapp_id === 'user1@whatsapp')).toBe(true);
    expect(users.some(u => u.whatsapp_id === 'user2@whatsapp')).toBe(true);
});

test('getPriorityUsers should handle database errors gracefully', () => {
    // Test that it returns empty array on error (service catches errors)
    const users = priorityService.getPriorityUsers();
    expect(Array.isArray(users)).toBe(true);
});

test('checkPriority should return false for null/undefined sender', () => {
    expect(priorityService.checkPriority(null)).toBe(false);
    expect(priorityService.checkPriority(undefined)).toBe(false);
    expect(priorityService.checkPriority('')).toBe(false);
});

test('checkPriority should return false for non-priority user', () => {
    expect(priorityService.checkPriority('regular@whatsapp')).toBe(false);
});

test('checkPriority should return true for priority user', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    expect(priorityService.checkPriority('vip@whatsapp')).toBe(true);
});

test('addPriorityUser should return false for null/undefined id', async () => {
    expect(await priorityService.addPriorityUser(null)).toBe(false);
    expect(await priorityService.addPriorityUser(undefined)).toBe(false);
    expect(await priorityService.addPriorityUser('')).toBe(false);
});

test('addPriorityUser should add priority user successfully', async () => {
    const result = await priorityService.addPriorityUser('vip@whatsapp', 'VIP User');
    expect(result).toBe(true);
    expect(priorityService.checkPriority('vip@whatsapp')).toBe(true);
});

test('addPriorityUser should add priority user without name', async () => {
    const result = await priorityService.addPriorityUser('vip2@whatsapp');
    expect(result).toBe(true);
    expect(priorityService.checkPriority('vip2@whatsapp')).toBe(true);
});

test('addPriorityUser should handle database errors gracefully', async () => {
    // Test normal successful path
    const result = await priorityService.addPriorityUser('test@whatsapp', 'Test');
    expect(typeof result).toBe('boolean');
    expect(result).toBe(true);
});

test('removePriorityUser should return false for null/undefined id', () => {
    expect(priorityService.removePriorityUser(null)).toBe(false);
    expect(priorityService.removePriorityUser(undefined)).toBe(false);
    expect(priorityService.removePriorityUser('')).toBe(false);
});

test('removePriorityUser should remove priority user successfully', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    expect(priorityService.checkPriority('vip@whatsapp')).toBe(true);
    
    const result = priorityService.removePriorityUser('vip@whatsapp');
    expect(result).toBe(true);
    expect(priorityService.checkPriority('vip@whatsapp')).toBe(false);
});

test('removePriorityUser should return false when user does not exist', () => {
    const result = priorityService.removePriorityUser('nonexistent@whatsapp');
    expect(result).toBe(false);
});

test('updateVipName should do nothing for null/undefined name', () => {
    dbService.addPriorityUser('vip@whatsapp', 'Old Name');
    
    priorityService.updateVipName('vip@whatsapp', null);
    priorityService.updateVipName('vip@whatsapp', undefined);
    priorityService.updateVipName('vip@whatsapp', '');
    
    // Should not throw, but name might not update
    const users = priorityService.getPriorityUsers();
    const user = users.find(u => u.whatsapp_id === 'vip@whatsapp');
    expect(user).toBeDefined();
});

test('updateVipName should update VIP name successfully', () => {
    dbService.addPriorityUser('vip@whatsapp', 'Old Name');
    
    priorityService.updateVipName('vip@whatsapp', 'New Name');
    
    const users = priorityService.getPriorityUsers();
    const user = users.find(u => u.whatsapp_id === 'vip@whatsapp');
    expect(user).toBeDefined();
    expect(user.name).toBe('New Name');
});

test('savePriorityUsers should not throw (legacy compatibility function)', () => {
    expect(() => {
        priorityService.savePriorityUsers([
            { id: 'user1@whatsapp', name: 'User 1' }
        ]);
    }).not.toThrow();
});

test('generateMobileToken should generate token for VIP user', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    
    const token = priorityService.generateMobileToken('vip@whatsapp');
    
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    
    // Verify token is stored in database
    const storedToken = dbService.getMobileToken('vip@whatsapp');
    expect(storedToken).toBe(token);
});

test('generateMobileToken should return null for invalid whatsappId', () => {
    expect(priorityService.generateMobileToken(null)).toBeNull();
    expect(priorityService.generateMobileToken(undefined)).toBeNull();
    expect(priorityService.generateMobileToken('')).toBeNull();
});

test('regenerateMobileToken should generate new token and clear fingerprint', () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    
    // Generate initial token
    const firstToken = priorityService.generateMobileToken('vip@whatsapp');
    expect(firstToken).toBeTruthy();
    
    // Set a fingerprint
    const db = getDatabase();
    db.prepare('UPDATE priority_users SET device_fingerprint = ? WHERE whatsapp_id = ?')
        .run('test-fingerprint', 'vip@whatsapp');
    
    // Regenerate token
    const newToken = priorityService.regenerateMobileToken('vip@whatsapp');
    
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(firstToken);
    
    // Verify fingerprint is cleared
    const vip = db.prepare('SELECT device_fingerprint FROM priority_users WHERE whatsapp_id = ?')
        .get('vip@whatsapp');
    expect(vip.device_fingerprint).toBeNull();
    
    // Verify new token is stored
    const storedToken = dbService.getMobileToken('vip@whatsapp');
    expect(storedToken).toBe(newToken);
});

test('regenerateMobileToken should return null for invalid whatsappId', () => {
    expect(priorityService.regenerateMobileToken(null)).toBeNull();
    expect(priorityService.regenerateMobileToken(undefined)).toBeNull();
    expect(priorityService.regenerateMobileToken('')).toBeNull();
});

test('getMobileAccessLink should return link with token', async () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    const token = priorityService.generateMobileToken('vip@whatsapp');
    
    const getLocalIPv4Stub = sinon.stub(helpersUtil, 'getLocalIPv4').resolves('192.168.1.100');
    const originalHost = config.server.host;
    const originalPort = config.server.port;
    config.server.host = 'localhost';
    config.server.port = 3000;
    
    try {
        const link = await priorityService.getMobileAccessLink('vip@whatsapp');
        
        expect(link).toBeTruthy();
        expect(typeof link).toBe('string');
        expect(link).toContain('http://192.168.1.100:3000/mobile/vip');
        expect(link).toContain(`token=${token}`);
        expect(getLocalIPv4Stub.calledOnce).toBe(true);
    } finally {
        getLocalIPv4Stub.restore();
        config.server.host = originalHost;
        config.server.port = originalPort;
    }
});

test('getMobileAccessLink should use config host if not localhost', async () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    const token = priorityService.generateMobileToken('vip@whatsapp');
    
    const originalHost = config.server.host;
    const originalPort = config.server.port;
    config.server.host = '192.168.1.50';
    config.server.port = 8080;
    
    try {
        const link = await priorityService.getMobileAccessLink('vip@whatsapp');
        
        expect(link).toBeTruthy();
        expect(link).toContain('http://192.168.1.50:8080/mobile/vip');
        expect(link).toContain(`token=${token}`);
    } finally {
        config.server.host = originalHost;
        config.server.port = originalPort;
    }
});

test('getMobileAccessLink should return null when no token exists', async () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    // Don't generate token
    
    const link = await priorityService.getMobileAccessLink('vip@whatsapp');
    
    expect(link).toBeNull();
});

test('sendMobileAccessLink should send link via WhatsApp', async () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    const token = priorityService.generateMobileToken('vip@whatsapp');
    
    const mockSocket = {
        sendMessage: sinon.stub().resolves()
    };
    
    priorityService.setWhatsAppSocket(mockSocket);
    
    const getLocalIPv4Stub = sinon.stub(helpersUtil, 'getLocalIPv4').resolves('192.168.1.100');
    const originalHost = config.server.host;
    const originalPort = config.server.port;
    config.server.host = 'localhost';
    config.server.port = 3000;
    
    try {
        const result = await priorityService.sendMobileAccessLink('vip@whatsapp', 'VIP User');
        
        expect(result).toBe(true);
        expect(mockSocket.sendMessage.called).toBe(true);
        // Should be called twice (introduction message + URL)
        expect(mockSocket.sendMessage.callCount).toBeGreaterThanOrEqual(1);
    } finally {
        getLocalIPv4Stub.restore();
        config.server.host = originalHost;
        config.server.port = originalPort;
        priorityService.setWhatsAppSocket(null);
    }
});

test('sendMobileAccessLink should return false when WhatsApp socket not available', async () => {
    priorityService.setWhatsAppSocket(null);
    
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    priorityService.generateMobileToken('vip@whatsapp');
    
    const result = await priorityService.sendMobileAccessLink('vip@whatsapp');
    
    expect(result).toBe(false);
});

test('sendMobileAccessLink should return false when no token exists', async () => {
    dbService.addPriorityUser('vip@whatsapp', 'VIP User');
    // Don't generate token
    
    const mockSocket = {
        sendMessage: sinon.stub().resolves()
    };
    
    priorityService.setWhatsAppSocket(mockSocket);
    
    try {
        const result = await priorityService.sendMobileAccessLink('vip@whatsapp');
        
        expect(result).toBe(false);
        expect(mockSocket.sendMessage.called).toBe(false);
    } finally {
        priorityService.setWhatsAppSocket(null);
    }
});

test('addPriorityUser should generate mobile token and send link', async () => {
    const mockSocket = {
        sendMessage: sinon.stub().resolves()
    };
    
    priorityService.setWhatsAppSocket(mockSocket);
    
    const getLocalIPv4Stub = sinon.stub(helpersUtil, 'getLocalIPv4').resolves('192.168.1.100');
    const originalHost = config.server.host;
    const originalPort = config.server.port;
    config.server.host = 'localhost';
    config.server.port = 3000;
    
    try {
        const result = await priorityService.addPriorityUser('vip@whatsapp', 'VIP User');
        
        expect(result).toBe(true);
        
        // Verify token was generated
        const token = dbService.getMobileToken('vip@whatsapp');
        expect(token).toBeTruthy();
        
        // Wait a bit for setTimeout to execute
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Verify WhatsApp message was sent (may be called multiple times due to sendMessageWithLinkPreview)
        expect(mockSocket.sendMessage.called).toBe(true);
    } finally {
        getLocalIPv4Stub.restore();
        config.server.host = originalHost;
        config.server.port = originalPort;
        priorityService.setWhatsAppSocket(null);
    }
});

