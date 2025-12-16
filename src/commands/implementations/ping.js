const groupsService = require('../../services/groups.service');
const { sendMessageWithMention } = require('../../utils/helpers.util');
const { logger } = require('../../utils/logger.util');

/**
 * !ping command - Request to add group to monitoring list
 * Confirmation happens in the web dashboard
 */

// Store pending group confirmations: Map<groupId, {groupId, groupName, senderId, senderName, timestamp}>
const pendingConfirmations = new Map();

// Cleanup old confirmations (older than 1 hour)
const CONFIRMATION_TIMEOUT = 60 * 60 * 1000;

function cleanupOldConfirmations() {
    const now = Date.now();
    for (const [groupId, confirmation] of pendingConfirmations.entries()) {
        if (now - confirmation.timestamp > CONFIRMATION_TIMEOUT) {
            pendingConfirmations.delete(groupId);
        }
    }
}

/**
 * Get all pending confirmations
 * @returns {Array} Array of pending confirmations
 */
function getPendingConfirmations() {
    cleanupOldConfirmations();
    return Array.from(pendingConfirmations.values());
}

/**
 * Remove a pending confirmation
 * @param {string} groupId - Group ID to remove
 * @returns {boolean} True if removed
 */
function removePendingConfirmation(groupId) {
    return pendingConfirmations.delete(groupId);
}

/**
 * !ping command handler
 */
async function pingCommand(sock, msg) {
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const senderName = msg.pushName || 'Unknown User';
    
    // Only work in groups
    if (!remoteJid.includes('@g.us')) {
        await sendMessageWithMention(sock, remoteJid, 'This command only works in groups.', sender);
        return;
    }
    
    // Check if group is already monitored
    if (groupsService.isGroupMonitored(remoteJid)) {
        await sendMessageWithMention(sock, remoteJid, 'This group is already being monitored.', sender);
        return;
    }
    
    // Check if there's already a pending confirmation for this group
    if (pendingConfirmations.has(remoteJid)) {
        await sendMessageWithMention(sock, remoteJid, 'A request to add this group is already pending. Please check the web dashboard to confirm.', sender);
        return;
    }
    
    // Fetch group metadata to get group name
    let groupName = 'Unknown Group';
    try {
        const groupMetadata = await sock.groupMetadata(remoteJid);
        groupName = groupMetadata.subject || 'Unknown Group';
    } catch (error) {
        logger.warn(`Could not fetch group metadata for ${remoteJid}:`, error);
    }
    
    // Store pending confirmation
    pendingConfirmations.set(remoteJid, {
        groupId: remoteJid,
        groupName: groupName,
        senderId: sender,
        senderName: senderName,
        timestamp: Date.now()
    });
    
    // Cleanup old confirmations
    cleanupOldConfirmations();
    
    await sendMessageWithMention(sock, remoteJid, `Request to add this group has been sent. Please check the web dashboard to confirm.`, sender);
    logger.info(`Pending group confirmation: ${remoteJid} (${groupName}) from ${senderName} (${sender})`);
}

module.exports = {
    pingCommand,
    getPendingConfirmations,
    removePendingConfirmation
};


