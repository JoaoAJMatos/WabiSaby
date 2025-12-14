const fs = require('fs');
const config = require('../config');
const { logger } = require('../utils/logger');

/**
 * Groups Service
 * Manages monitored WhatsApp groups
 */

const GROUPS_FILE = config.files.groups;

/**
 * Get all monitored groups
 * @returns {Array<{id: string, name: string, addedAt: string}>} - Array of monitored groups
 */
function getGroups() {
    if (fs.existsSync(GROUPS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8'));
            const groups = data.groups || [];
            return groups;
        } catch (e) {
            logger.error('Error reading groups file:', e);
            return [];
        }
    }
    return [];
}

/**
 * Load groups from file (alias for getGroups for consistency)
 * @returns {Array<{id: string, name: string, addedAt: string}>} - Array of monitored groups
 */
function loadGroups() {
    return getGroups();
}

/**
 * Save groups to file
 * @param {Array<{id: string, name: string, addedAt: string}>} groups - Array of groups
 */
function saveGroups(groups) {
    try {
        fs.writeFileSync(GROUPS_FILE, JSON.stringify({ groups }, null, 2));
        logger.info(`Saved ${groups.length} groups to file`);
    } catch (e) {
        logger.error('Error saving groups file:', e);
    }
}

/**
 * Check if a group is being monitored
 * @param {string} groupId - Group ID to check
 * @returns {boolean} - True if group is monitored
 */
function isGroupMonitored(groupId) {
    if (!groupId) return false;
    
    const groups = getGroups();
    if (!groups || groups.length === 0) {
        // Backward compatibility: check if TARGET_GROUP_ID is set
        const targetGroupId = config.whatsapp.targetGroupId;
        if (targetGroupId && groupId === targetGroupId) {
            return true;
        }
        return false;
    }
    
    return groups.some(group => group.id === groupId);
}

/**
 * Add a group to monitoring list
 * @param {string} id - Group ID
 * @param {string} name - Group name
 * @returns {boolean} - True if added successfully
 */
function addGroup(id, name = 'Unknown Group') {
    if (!id) return false;
    
    const groups = getGroups();
    if (!groups.find(g => g.id === id)) {
        groups.push({
            id,
            name,
            addedAt: new Date().toISOString()
        });
        saveGroups(groups);
        logger.info(`Added group: ${id} (${name})`);
        return true;
    }
    return false;
}

/**
 * Remove a group from monitoring list
 * @param {string} id - Group ID to remove
 * @returns {boolean} - True if removed successfully
 */
function removeGroup(id) {
    if (!id) return false;
    
    let groups = getGroups();
    const initialLength = groups.length;
    groups = groups.filter(g => g.id !== id);
    
    if (groups.length < initialLength) {
        saveGroups(groups);
        logger.info(`Removed group: ${id}`);
        return true;
    }
    return false;
}

/**
 * Update group name
 * @param {string} id - Group ID
 * @param {string} name - New group name
 */
function updateGroupName(id, name) {
    if (!name || !id) return;
    
    const groups = getGroups();
    const group = groups.find(g => g.id === id);
    
    if (group && group.name !== name) {
        group.name = name;
        saveGroups(groups);
        logger.info(`Updated group name: ${id} -> ${name}`);
    }
}

/**
 * Migrate from old TARGET_GROUP_ID to groups.json
 * This should be called on startup if groups.json doesn't exist but TARGET_GROUP_ID is set
 */
function migrateFromTargetGroupId() {
    const groups = getGroups();
    const targetGroupId = config.whatsapp.targetGroupId;
    
    // Only migrate if no groups exist and targetGroupId is set
    if (groups.length === 0 && targetGroupId) {
        logger.info(`Migrating TARGET_GROUP_ID to groups.json: ${targetGroupId}`);
        addGroup(targetGroupId, 'Migrated Group');
        return true;
    }
    return false;
}

module.exports = {
    getGroups,
    loadGroups,
    saveGroups,
    isGroupMonitored,
    addGroup,
    removeGroup,
    updateGroupName,
    migrateFromTargetGroupId
};

