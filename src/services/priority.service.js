const { logger } = require('../utils/logger');
const dbService = require('../database/db.service');

/**
 * Priority Service
 * Manages VIP/priority users
 */

/**
 * Get all priority users
 * @returns {Array<{id: string, name: string|null}>} - Array of priority users
 */
function getPriorityUsers() {
    try {
        return dbService.getPriorityUsers();
    } catch (e) {
        logger.error('Error reading priority users:', e);
        return [];
    }
}

/**
 * Save priority users to database (legacy function for compatibility)
 * @param {Array<{id: string, name: string|null}>} users - Array of priority users
 */
function savePriorityUsers(users) {
    // This function is kept for compatibility but users are saved individually via addPriorityUser
    logger.info(`Priority users are managed individually via addPriorityUser/removePriorityUser`);
}

/**
 * Check if a user is a VIP/priority user
 * @param {string} sender - User ID to check
 * @returns {boolean} - True if user has priority
 */
function checkPriority(sender) {
    if (!sender) return false;
    return dbService.isPriorityUser(sender);
}

/**
 * Add a priority user
 * @param {string} id - User ID
 * @param {string|null} name - Optional user name
 * @returns {boolean} - True if added successfully
 */
function addPriorityUser(id, name = null) {
    if (!id) return false;
    
    try {
        const added = dbService.addPriorityUser(id, name);
        if (added) {
            logger.info(`Added priority user: ${id} (${name || 'no name'})`);
        }
        return added;
    } catch (e) {
        logger.error('Error adding priority user:', e);
        return false;
    }
}

/**
 * Remove a priority user
 * @param {string} id - User ID to remove
 * @returns {boolean} - True if removed successfully
 */
function removePriorityUser(id) {
    if (!id) return false;
    
    try {
        const removed = dbService.removePriorityUser(id);
        if (removed) {
            logger.info(`Removed priority user: ${id}`);
        }
        return removed;
    } catch (e) {
        logger.error('Error removing priority user:', e);
        return false;
    }
}

/**
 * Update VIP name when they send a message
 * @param {string} id - User ID
 * @param {string} name - User name
 */
function updateVipName(id, name) {
    if (!name) return;
    
    try {
        dbService.updateVipName(id, name);
        logger.info(`Updated VIP name: ${id} -> ${name}`);
    } catch (e) {
        logger.error('Error updating VIP name:', e);
    }
}

module.exports = {
    getPriorityUsers,
    savePriorityUsers,
    checkPriority,
    addPriorityUser,
    removePriorityUser,
    updateVipName
};

