const { logger } = require('../../utils/logger.util');
const dbService = require('../../infrastructure/database/db.service');
const config = require('../../config');
const { sendMessageWithMention, sendMessageWithLinkPreview } = require('../../utils/helpers.util');
const helpersUtil = require('../../utils/helpers.util');

/**
 * Priority Service
 * Manages VIP/priority users
 */
class PriorityService {
    constructor() {
        // Store reference to WhatsApp socket
        this.whatsappSocket = null;
    }

    /**
     * Set WhatsApp socket reference for sending messages
     * @param {Object} sock - WhatsApp socket instance
     */
    setWhatsAppSocket(sock) {
        this.whatsappSocket = sock;
    }

    /**
     * Get all priority users
     * @returns {Array<{id: string, name: string|null}>} - Array of priority users
     */
    getPriorityUsers() {
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
    savePriorityUsers(users) {
        // This function is kept for compatibility but users are saved individually via addPriorityUser
        logger.info(`Priority users are managed individually via addPriorityUser/removePriorityUser`);
    }

    /**
     * Check if a user is a VIP/priority user
     * @param {string} sender - User ID to check
     * @returns {boolean} - True if user has priority
     */
    checkPriority(sender) {
        if (!sender) return false;
        return dbService.isPriorityUser(sender);
    }

    /**
     * Generate mobile access link for a VIP
     * @param {string} whatsappId - WhatsApp user ID
     * @returns {Promise<string|null>} Mobile access link or null
     */
    async getMobileAccessLink(whatsappId) {
        const token = dbService.getMobileToken(whatsappId);
        if (!token) return null;

        // Use local IPv4 address for mobile access (so phones on same network can access)
        // If config has a specific host set and it's not localhost, use that
        const configHost = config.server.host;
        const host = (configHost && configHost !== 'localhost' && configHost !== '127.0.0.1')
            ? configHost
            : await helpersUtil.getLocalIPv4();
        const port = config.server.port || 3000;
        return `http://${host}:${port}/mobile/vip?token=${token}`;
    }

    /**
     * Send mobile access link via WhatsApp
     * @param {string} whatsappId - WhatsApp user ID
     * @param {string} name - User name (optional)
     * @returns {Promise<boolean>} - True if message sent successfully
     */
    async sendMobileAccessLink(whatsappId, name = null) {
        if (!this.whatsappSocket) {
            logger.warn('WhatsApp socket not available, cannot send mobile access link');
            return false;
        }

        try {
            const link = await this.getMobileAccessLink(whatsappId);
            if (!link) {
                logger.error(`No mobile token found for VIP: ${whatsappId}`);
                return false;
            }

            const userName = name || 'VIP User';
            const introduction = `🎵 *WabiSaby Mobile Access*\n\n` +
                `👋 Hello ${userName}! You've been granted VIP access to the music bot.\n\n` +
                `📱 Your mobile access link will appear in the next message.\n\n` +
                `✨ *What you can do:*\n` +
                `🎶 View the current song\n` +
                `📋 See the queue\n` +
                `🎚️ Control audio effects\n\n` +
                `🔒 *Security Note:* This link will be bound to your device for security.`;

            await sendMessageWithLinkPreview(
                this.whatsappSocket,
                whatsappId,
                introduction,
                link,
                'WabiSaby Mobile Access',
                `VIP access to your music bot dashboard. View current song, queue, and control audio effects.`
            );
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
    generateMobileToken(whatsappId) {
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
    regenerateMobileToken(whatsappId) {
        if (!whatsappId) return null;

        try {
            const token = this.generateMobileToken(whatsappId);
            if (token) {
                // Clear device fingerprint when regenerating token
                const { getDatabase } = require('../../infrastructure/database');
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
    async addPriorityUser(id, name = null) {
        if (!id) return false;

        try {
            const added = dbService.addPriorityUser(id, name);
            if (added) {
                logger.info(`Added priority user: ${id} (${name || 'no name'})`);

                // Generate mobile token
                const token = this.generateMobileToken(id);
                if (token) {
                    // Send WhatsApp message with mobile access link
                    // Use setTimeout to avoid blocking, in case WhatsApp isn't ready yet
                    setTimeout(async () => {
                        await this.sendMobileAccessLink(id, name);
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
    removePriorityUser(id) {
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
    updateVipName(id, name) {
        if (!name) return;

        try {
            dbService.updateVipName(id, name);
            logger.info(`Updated VIP name: ${id} -> ${name}`);
        } catch (e) {
            logger.error('Error updating VIP name:', e);
        }
    }
}

// Export singleton instance
const priorityService = new PriorityService();

// Backward compatibility - export methods directly
module.exports = {
    getPriorityUsers: priorityService.getPriorityUsers.bind(priorityService),
    savePriorityUsers: priorityService.savePriorityUsers.bind(priorityService),
    checkPriority: priorityService.checkPriority.bind(priorityService),
    addPriorityUser: priorityService.addPriorityUser.bind(priorityService),
    removePriorityUser: priorityService.removePriorityUser.bind(priorityService),
    updateVipName: priorityService.updateVipName.bind(priorityService),
    setWhatsAppSocket: priorityService.setWhatsAppSocket.bind(priorityService),
    generateMobileToken: priorityService.generateMobileToken.bind(priorityService),
    regenerateMobileToken: priorityService.regenerateMobileToken.bind(priorityService),
    getMobileAccessLink: priorityService.getMobileAccessLink.bind(priorityService),
    sendMobileAccessLink: priorityService.sendMobileAccessLink.bind(priorityService)
};

