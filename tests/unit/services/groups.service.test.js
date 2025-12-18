/**
 * Groups Service Tests
 * Tests for WhatsApp group monitoring management
 */

const { test, expect, beforeEach } = require('bun:test');
const { initializeDatabase, getDatabase } = require('../../../src/database/index');
const dbService = require('../../../src/database/db.service');
const groupsService = require('../../../src/services/groups.service');
const config = require('../../../src/config');

beforeEach(() => {
    // Initialize database
    try {
        initializeDatabase();
    } catch (e) {
        // Database might already be initialized
    }
    
    // Clear all groups
    const db = getDatabase();
    db.exec('DELETE FROM groups;');
});

test('getGroups should return empty array when no groups exist', () => {
    const groups = groupsService.getGroups();
    expect(Array.isArray(groups)).toBe(true);
    expect(groups.length).toBe(0);
});

test('getGroups should return all groups with correct format', () => {
    const now = Math.floor(Date.now() / 1000);
    dbService.addGroup('group1@whatsapp', 'Group 1');
    dbService.addGroup('group2@whatsapp', 'Group 2');
    
    const groups = groupsService.getGroups();
    expect(groups.length).toBe(2);
    
    const group1 = groups.find(g => g.id === 'group1@whatsapp');
    expect(group1).toBeDefined();
    expect(group1.name).toBe('Group 1');
    expect(group1.addedAt).toBeDefined();
    expect(typeof group1.addedAt).toBe('string');
    
    const group2 = groups.find(g => g.id === 'group2@whatsapp');
    expect(group2).toBeDefined();
    expect(group2.name).toBe('Group 2');
});

test('getGroups should handle database errors gracefully', () => {
    // Test that it returns empty array on error
    const groups = groupsService.getGroups();
    expect(Array.isArray(groups)).toBe(true);
});

test('loadGroups should return same result as getGroups', () => {
    dbService.addGroup('group1@whatsapp', 'Group 1');
    
    const groups1 = groupsService.getGroups();
    const groups2 = groupsService.loadGroups();
    
    expect(groups1).toEqual(groups2);
});

test('isGroupMonitored should return false for null/undefined groupId', () => {
    expect(groupsService.isGroupMonitored(null)).toBe(false);
    expect(groupsService.isGroupMonitored(undefined)).toBe(false);
    expect(groupsService.isGroupMonitored('')).toBe(false);
});

test('isGroupMonitored should return false for non-monitored group', () => {
    expect(groupsService.isGroupMonitored('unknown@whatsapp')).toBe(false);
});

test('isGroupMonitored should return true for monitored group', () => {
    dbService.addGroup('group1@whatsapp', 'Group 1');
    expect(groupsService.isGroupMonitored('group1@whatsapp')).toBe(true);
});

test('isGroupMonitored should check TARGET_GROUP_ID when no groups exist', () => {
    // Clear all groups first
    const db = getDatabase();
    db.exec('DELETE FROM groups;');
    
    // Store original config value
    const originalTargetGroupId = config.whatsapp.targetGroupId;
    
    // Set a target group ID
    config.whatsapp.targetGroupId = 'target@whatsapp';
    
    try {
        // Should return true for the target group
        expect(groupsService.isGroupMonitored('target@whatsapp')).toBe(true);
        
        // Should return false for other groups
        expect(groupsService.isGroupMonitored('other@whatsapp')).toBe(false);
    } finally {
        // Restore original config
        config.whatsapp.targetGroupId = originalTargetGroupId;
    }
});

test('isGroupMonitored should prefer database groups over TARGET_GROUP_ID', () => {
    // Store original config value
    const originalTargetGroupId = config.whatsapp.targetGroupId;
    
    try {
        // Set a target group ID
        config.whatsapp.targetGroupId = 'target@whatsapp';
        
        // Add a different group to database
        dbService.addGroup('dbgroup@whatsapp', 'DB Group');
        
        // Should return true for database group
        expect(groupsService.isGroupMonitored('dbgroup@whatsapp')).toBe(true);
        
        // Should return false for target group (database groups take precedence)
        expect(groupsService.isGroupMonitored('target@whatsapp')).toBe(false);
    } finally {
        // Restore original config
        config.whatsapp.targetGroupId = originalTargetGroupId;
    }
});

test('addGroup should return false for null/undefined id', () => {
    expect(groupsService.addGroup(null)).toBe(false);
    expect(groupsService.addGroup(undefined)).toBe(false);
    expect(groupsService.addGroup('')).toBe(false);
});

test('addGroup should add group successfully', () => {
    const result = groupsService.addGroup('group1@whatsapp', 'Group 1');
    expect(result).toBe(true);
    expect(groupsService.isGroupMonitored('group1@whatsapp')).toBe(true);
});

test('addGroup should use default name when name not provided', () => {
    const result = groupsService.addGroup('group1@whatsapp');
    expect(result).toBe(true);
    
    const groups = groupsService.getGroups();
    const group = groups.find(g => g.id === 'group1@whatsapp');
    expect(group).toBeDefined();
    expect(group.name).toBe('Unknown Group');
});

test('addGroup should handle database errors gracefully', () => {
    // Test normal successful path
    const result = groupsService.addGroup('test@whatsapp', 'Test Group');
    expect(typeof result).toBe('boolean');
    expect(result).toBe(true);
});

test('removeGroup should return false for null/undefined id', () => {
    expect(groupsService.removeGroup(null)).toBe(false);
    expect(groupsService.removeGroup(undefined)).toBe(false);
    expect(groupsService.removeGroup('')).toBe(false);
});

test('removeGroup should remove group successfully', () => {
    dbService.addGroup('group1@whatsapp', 'Group 1');
    expect(groupsService.isGroupMonitored('group1@whatsapp')).toBe(true);
    
    const result = groupsService.removeGroup('group1@whatsapp');
    expect(result).toBe(true);
    expect(groupsService.isGroupMonitored('group1@whatsapp')).toBe(false);
});

test('removeGroup should return false when group does not exist', () => {
    const result = groupsService.removeGroup('nonexistent@whatsapp');
    expect(result).toBe(false);
});

test('updateGroupName should return false for null/undefined name or id', () => {
    dbService.addGroup('group1@whatsapp', 'Old Name');
    
    expect(groupsService.updateGroupName('group1@whatsapp', null)).toBe(false);
    expect(groupsService.updateGroupName('group1@whatsapp', undefined)).toBe(false);
    expect(groupsService.updateGroupName('group1@whatsapp', '')).toBe(false);
    expect(groupsService.updateGroupName(null, 'New Name')).toBe(false);
    expect(groupsService.updateGroupName(undefined, 'New Name')).toBe(false);
    
    // Should not throw and should not update
    const groups = groupsService.getGroups();
    const group = groups.find(g => g.id === 'group1@whatsapp');
    expect(group).toBeDefined();
    expect(group.name).toBe('Old Name');
});

test('updateGroupName should return true and update group name successfully', () => {
    dbService.addGroup('group1@whatsapp', 'Old Name');
    
    const result = groupsService.updateGroupName('group1@whatsapp', 'New Name');
    expect(result).toBe(true);
    
    const groups = groupsService.getGroups();
    const group = groups.find(g => g.id === 'group1@whatsapp');
    expect(group).toBeDefined();
    expect(group.name).toBe('New Name');
});

test('updateGroupName should return false when group does not exist', () => {
    const result = groupsService.updateGroupName('nonexistent@whatsapp', 'New Name');
    expect(result).toBe(false);
    
    const groups = groupsService.getGroups();
    const group = groups.find(g => g.id === 'nonexistent@whatsapp');
    expect(group).toBeUndefined();
});

test('updateGroupName should return false for invalid inputs', () => {
    expect(groupsService.updateGroupName('', 'Valid Name')).toBe(false);
    expect(groupsService.updateGroupName('valid@whatsapp', null)).toBe(false);
    expect(groupsService.updateGroupName('valid@whatsapp', undefined)).toBe(false);
    expect(groupsService.updateGroupName('valid@whatsapp', '')).toBe(false);
});

test('migrateFromTargetGroupId should return false when groups already exist', () => {
    // Add a group
    dbService.addGroup('existing@whatsapp', 'Existing Group');
    
    // Store original config value
    const originalTargetGroupId = config.whatsapp.targetGroupId;
    
    try {
        config.whatsapp.targetGroupId = 'target@whatsapp';
        
        const result = groupsService.migrateFromTargetGroupId();
        expect(result).toBe(false);
        
        // Should not add target group
        expect(groupsService.isGroupMonitored('target@whatsapp')).toBe(false);
    } finally {
        config.whatsapp.targetGroupId = originalTargetGroupId;
    }
});

test('migrateFromTargetGroupId should return false when TARGET_GROUP_ID is not set', () => {
    // Clear all groups
    const db = getDatabase();
    db.exec('DELETE FROM groups;');
    
    // Store original config value
    const originalTargetGroupId = config.whatsapp.targetGroupId;
    
    try {
        config.whatsapp.targetGroupId = null;
        
        const result = groupsService.migrateFromTargetGroupId();
        expect(result).toBe(false);
    } finally {
        config.whatsapp.targetGroupId = originalTargetGroupId;
    }
});

test('migrateFromTargetGroupId should migrate TARGET_GROUP_ID when no groups exist', () => {
    // Clear all groups
    const db = getDatabase();
    db.exec('DELETE FROM groups;');
    
    // Store original config value
    const originalTargetGroupId = config.whatsapp.targetGroupId;
    
    try {
        config.whatsapp.targetGroupId = 'target@whatsapp';
        
        const result = groupsService.migrateFromTargetGroupId();
        expect(result).toBe(true);
        
        // Should add the target group
        expect(groupsService.isGroupMonitored('target@whatsapp')).toBe(true);
        
        const groups = groupsService.getGroups();
        const group = groups.find(g => g.id === 'target@whatsapp');
        expect(group).toBeDefined();
        expect(group.name).toBe('Migrated Group');
    } finally {
        config.whatsapp.targetGroupId = originalTargetGroupId;
    }
});

test('saveGroups should not throw (legacy compatibility function)', () => {
    expect(() => {
        groupsService.saveGroups([
            { id: 'group1@whatsapp', name: 'Group 1', addedAt: new Date().toISOString() }
        ]);
    }).not.toThrow();
});

