const { logger } = require('../utils/logger.util');
const dbService = require('../database/db.service');
const config = require('../config');
const { sendMessageWithMention, getLocalIPv4 } = require('../utils/helpers.util');

/**
 * Priority Service
 * Manages VIP/priority users
 */

// Store reference to WhatsApp socket
let whatsappSocket = null;

/**
 * Set WhatsApp socket reference for sending messages
 * @param {Object} sock - WhatsApp socket instance
 */
function setWhatsAppSocket(sock) {
    whatsappSocket = sock;
}

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
 * Generate mobile access link for a VIP
 * @param {string} whatsappId - WhatsApp user ID
 * @returns {string|null} Mobile access link or null
 */
function getMobileAccessLink(whatsappId) {
    const token = dbService.getMobileToken(whatsappId);
    if (!token) return null;
    
    // Use local IPv4 address for mobile access (so phones on same network can access)
    // If config has a specific host set and it's not localhost, use that
    const configHost = config.server.host;
    const host = (configHost && configHost !== 'localhost' && configHost !== '127.0.0.1') 
        ? configHost 
        : getLocalIPv4();
    const port = config.server.port || 3000;
    return `http://${host}:${port}/mobile/vip?token=${token}`;
}

/**
 * Send mobile access link via WhatsApp
 * @param {string} whatsappId - WhatsApp user ID
 * @param {string} name - User name (optional)
 * @returns {Promise<boolean>} - True if message sent successfully
 */
async function sendMobileAccessLink(whatsappId, name = null) {
    if (!whatsappSocket) {
        logger.warn('WhatsApp socket not available, cannot send mobile access link');
        return false;
    }
    
    try {
        const link = getMobileAccessLink(whatsappId);
        if (!link) {
            logger.error(`No mobile token found for VIP: ${whatsappId}`);
            return false;
        }
        
        const userName = name || 'VIP User';
        const message = `🎵 *WabiSaby Mobile Access*\n\n` +
            `Hello ${userName}! You've been granted VIP access to the music bot.\n\n` +
            `📱 *Mobile Access Link:*\n${link}\n\n` +
            `This link is unique to your device. Save it to access the bot from your phone!\n\n` +
            `You can:\n` +
            `• View the current song\n` +
            `• See the queue\n` +
            `• Control audio effects\n\n` +
            `*Note:* This link is bound to your device for security.`;
        
        await sendMessageWithMention(whatsappSocket, whatsappId, message);
        logger.info(`Sent mobile access link to VIP: ${whatsappId}`);
        return true;
    } catch (error) {
        logger.error(`Error sending mobile access link to ${whatsappId}:`, error);
        return false;
    }
}

/**
 * Generate and store mobile token for a VIP
 * @param {string} whatsappId - WhatsApp user ID
 * @returns {string|null} Generated token or null
 */
function generateMobileToken(whatsappId) {
    if (!whatsappId) return null;
    
    try {
        const token = dbService.generateMobileToken();
        dbService.setMobileToken(whatsappId, token);
        logger.info(`Generated mobile token for VIP: ${whatsappId}`);
        return token;
    } catch (error) {
        logger.error(`Error generating mobile token for ${whatsappId}:`, error);
        return null;
    }
}

/**
 * Regenerate mobile token for a VIP
 * @param {string} whatsappId - WhatsApp user ID
 * @returns {string|null} New token or null
 */
function regenerateMobileToken(whatsappId) {
    if (!whatsappId) return null;
    
    try {
        const token = generateMobileToken(whatsappId);
        if (token) {
            // Clear device fingerprint when regenerating token
            const { getDatabase } = require('../database');
            const db = getDatabase();
            db.prepare('UPDATE priority_users SET device_fingerprint = NULL, fingerprint_created_at = NULL WHERE whatsapp_id = ?').run(whatsappId);
            logger.info(`Regenerated mobile token for VIP: ${whatsappId}`);
        }
        return token;
    } catch (error) {
        logger.error(`Error regenerating mobile token for ${whatsappId}:`, error);
        return null;
    }
}

/**
 * Add a priority user
 * @param {string} id - User ID
 * @param {string|null} name - Optional user name
 * @returns {boolean} - True if added successfully
 */
async function addPriorityUser(id, name = null) {
    if (!id) return false;
    
    try {
        const added = dbService.addPriorityUser(id, name);
        if (added) {
            logger.info(`Added priority user: ${id} (${name || 'no name'})`);
            
            // Generate mobile token
            const token = generateMobileToken(id);
            if (token) {
                // Send WhatsApp message with mobile access link
                // Use setTimeout to avoid blocking, in case WhatsApp isn't ready yet
                setTimeout(async () => {
                    await sendMobileAccessLink(id, name);
                }, 1000);
            }
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
    updateVipName,
    setWhatsAppSocket,
    generateMobileToken,
    regenerateMobileToken,
    getMobileAccessLink,
    sendMobileAccessLink
};

