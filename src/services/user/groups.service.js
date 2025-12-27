const config = require('../../config');
const { logger } = require('../../utils/logger.util');
const dbService = require('../../infrastructure/database/db.service');

/**
 * Groups Service
 * Manages monitored WhatsApp groups
 */

/**
 * Get all monitored groups
 * @returns {Array<{id: string, name: string, addedAt: string}>} - Array of monitored groups
 */
function getGroups() {
    try {
        const groups = dbService.getGroups();
        return groups.map(group => ({
            id: group.id,
            name: group.name,
            addedAt: new Date(group.added_at * 1000).toISOString()
        }));
    } catch (e) {
        logger.error('Error reading groups:', e);
        return [];
    }
}

/**
 * Load groups from database (alias for getGroups for consistency)
 * @returns {Array<{id: string, name: string, addedAt: string}>} - Array of monitored groups
 */
function loadGroups() {
    return getGroups();
}

/**
 * Save groups to database (legacy function for compatibility)
 * @param {Array<{id: string, name: string, addedAt: string}>} groups - Array of groups
 */
function saveGroups(groups) {
    // This function is kept for compatibility but groups are saved individually via addGroup
    logger.info(`Groups are managed individually via addGroup/removeGroup`);
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
    
    try {
        const added = dbService.addGroup(id, name);
        if (added) {
            logger.info(`Added group: ${id} (${name})`);
        }
        return added;
    } catch (e) {
        logger.error('Error adding group:', e);
        return false;
    }
}

/**
 * Remove a group from monitoring list
 * @param {string} id - Group ID to remove
 * @returns {boolean} - True if removed successfully
 */
function removeGroup(id) {
    if (!id) return false;
    
    try {
        const removed = dbService.removeGroup(id);
        if (removed) {
            logger.info(`Removed group: ${id}`);
        }
        return removed;
    } catch (e) {
        logger.error('Error removing group:', e);
        return false;
    }
}

/**
 * Update group name
 * @param {string} id - Group ID
 * @param {string} name - New group name
 * @returns {boolean} - True if updated successfully, false otherwise
 */
function updateGroupName(id, name) {
    if (!name || !id) return false;
    
    // Check if group exists
    if (!isGroupMonitored(id)) {
        return false;
    }
    
    try {
        dbService.updateGroupName(id, name);
        logger.info(`Updated group name: ${id} -> ${name}`);
        return true;
    } catch (e) {
        logger.error('Error updating group name:', e);
        return false;
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

