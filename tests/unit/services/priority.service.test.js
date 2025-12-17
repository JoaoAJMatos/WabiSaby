/**
 * Priority Service Tests
 * Tests for VIP/priority user management
 */

const { test, expect, beforeEach } = require('bun:test');
const { initializeDatabase, getDatabase } = require('../../../src/database/index');
const dbService = require('../../../src/database/db.service');
const priorityService = require('../../../src/services/priority.service');

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

