const fs = require('fs');
const config = require('../config');
const { logger } = require('../utils/logger');

/**
 * Priority Service
 * Manages VIP/priority users
 */

const PRIORITY_FILE = config.files.priority;

/**
 * Get all priority users
 * @returns {Array<{id: string, name: string|null}>} - Array of priority users
 */
function getPriorityUsers() {
    if (fs.existsSync(PRIORITY_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(PRIORITY_FILE, 'utf8'));
            const users = data.priorityUsers || [];
            return users;
        } catch (e) {
            logger.error('Error reading priority file:', e);
            return [];
        }
    }
    return [];
}

/**
 * Save priority users to file
 * @param {Array<{id: string, name: string|null}>} users - Array of priority users
 */
function savePriorityUsers(users) {
    try {
        fs.writeFileSync(PRIORITY_FILE, JSON.stringify({ priorityUsers: users }, null, 2));
    } catch (e) {
        logger.error('Error saving priority file:', e);
    }
}

/**
 * Check if a user is a VIP/priority user
 * @param {string} sender - User ID to check
 * @returns {boolean} - True if user has priority
 */
function checkPriority(sender) {
    if (!sender) return false;
    
    const users = getPriorityUsers();
    if (!users || users.length === 0) return false;
    
    // Support both old format (array of strings) and new format (array of objects)
    if (typeof users[0] === 'string') {
        return users.includes(sender);
    } else {
        return users.some(user => user.id === sender);
    }
}

/**
 * Add a priority user
 * @param {string} id - User ID
 * @param {string|null} name - Optional user name
 * @returns {boolean} - True if added successfully
 */
function addPriorityUser(id, name = null) {
    if (!id) return false;
    
    const users = getPriorityUsers();
    if (!users.find(u => u.id === id)) {
        users.push({ id, name });
        savePriorityUsers(users);
        logger.info(`Added priority user: ${id} (${name || 'no name'})`);
        return true;
    }
    return false;
}

/**
 * Remove a priority user
 * @param {string} id - User ID to remove
 * @returns {boolean} - True if removed successfully
 */
function removePriorityUser(id) {
    if (!id) return false;
    
    let users = getPriorityUsers();
    const initialLength = users.length;
    users = users.filter(u => u.id !== id);
    
    if (users.length < initialLength) {
        savePriorityUsers(users);
        logger.info(`Removed priority user: ${id}`);
        return true;
    }
    return false;
}

/**
 * Update VIP name when they send a message
 * @param {string} id - User ID
 * @param {string} name - User name
 */
function updateVipName(id, name) {
    if (!name) return;
    
    const users = getPriorityUsers();
    const vip = users.find(u => u.id === id);
    
    if (vip && vip.name !== name) {
        vip.name = name;
        savePriorityUsers(users);
        logger.info(`Updated VIP name: ${id} -> ${name}`);
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

