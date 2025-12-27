const { logger } = require('../../utils/logger.util');
const config = require('../../config');
const helpersUtil = require('../../utils/helpers.util');
const { PLAYBACK_STARTED, QUEUE_UPDATED } = require('../../events');
const dbService = require('../../infrastructure/database/db.service');

/**
 * Notification Service
 * Sends notifications to users when their requested song is coming up
 */

class NotificationService {
    constructor() {
        this.sock = null;
        this.isEnabled = config.notifications.enabled;
        this.notifyAtPosition = config.notifications.notifyAtPosition;
        this.notifiedSongs = new Set(); // Track songs we've already notified about
    }

    /**
     * Initialize the notification service with WhatsApp socket
     * @param {Object} sock - WhatsApp socket instance
     */
    initialize(sock) {
        this.sock = sock;
        // Event listeners are now registered in the centralized listener registry
        logger.info('[Notification Service] Initialized');
    }

    /**
     * Check if notifications are enabled for a specific user
     * Checks both global setting and user-level preference
     * @param {string} whatsappId - User's WhatsApp ID
     * @returns {boolean} True if notifications should be sent to this user
     */
    isUserNotificationEnabled(whatsappId) {
        // First check global setting - if disabled, no notifications for anyone
        if (!this.isEnabled) {
            return false;
        }
        
        // Then check user-level preference
        return dbService.getUserNotificationPreference(whatsappId);
    }

    /**
     * Check the queue and notify users whose songs are coming up
     */
    async checkAndNotifyUpcomingSongs() {
        if (!this.sock || !this.isEnabled) {
            return;
        }

        // Access services lazily to avoid circular dependency issues
        const servicesRef = require('../');
        if (!servicesRef.playback || !servicesRef.playback.queue || !servicesRef.playback.orchestrator) {
            return;
        }

        const queue = servicesRef.playback.queue.getQueue();
        const currentSong = servicesRef.playback.orchestrator.getCurrent();

        // Only proceed if there's a current song playing
        if (!currentSong) {
            return;
        }

        // Calculate which position to notify at (0-indexed)
        const notifyIndex = Math.max(0, this.notifyAtPosition - 1);
        
        // Check if we have a song at the notify position
        if (queue.length > notifyIndex) {
            const songToNotify = queue[notifyIndex];
            
            // Create a unique identifier for this notification
            const notificationId = `${songToNotify.requester}_${songToNotify.title}_${songToNotify.content}`;
            
            // Only notify if we haven't already notified about this song and it's not from the web dashboard
            if (!this.notifiedSongs.has(notificationId) && songToNotify.remoteJid !== 'WEB_DASHBOARD') {
                // Check if notifications are enabled for this specific user
                const userWhatsappId = songToNotify.sender;
                if (!this.isUserNotificationEnabled(userWhatsappId)) {
                    return; // User has disabled notifications, skip
                }
                
                try {
                    const positionInQueue = notifyIndex + 1;
                    const message = this.formatUpcomingMessage(songToNotify, positionInQueue);
                    const userJid = songToNotify.sender;
                    await helpersUtil.sendMessageWithMention(this.sock, userJid, message);
                    
                    // Mark this song as notified
                    this.notifiedSongs.add(notificationId);
                    logger.info(`[Notification Service] Notified ${songToNotify.requester} about upcoming song (position ${positionInQueue}): ${songToNotify.title}`);
                    
                    // Clean up old notifications (keep only last 50)
                    if (this.notifiedSongs.size > 50) {
                        const toDelete = Array.from(this.notifiedSongs).slice(0, 10);
                        toDelete.forEach(id => this.notifiedSongs.delete(id));
                    }
                } catch (error) {
                    logger.error('[Notification Service] Failed to send notification:', error.message);
                }
            }
        }
    }

    /**
     * Send playback notification (now playing, errors, etc.)
     * @param {string} remoteJid - Target JID (group or user)
     * @param {string} message - Message text
     * @param {string} sender - Sender JID for mention
     * @returns {Promise<boolean>} True if sent successfully
     */
    async sendPlaybackNotification(remoteJid, message, sender) {
        if (!this.sock || !remoteJid || remoteJid === 'WEB_DASHBOARD') {
            return false;
        }
        
        try {
            await helpersUtil.sendMessageWithMention(this.sock, remoteJid, message, sender);
            return true;
        } catch (e) {
            logger.warn('Failed to send playback notification:', e.message);
            return false;
        }
    }

    /**
     * Format the notification message
     * @param {Object} song - Song object
     * @param {number} position - Position in queue (1 = next, 2 = second, etc.)
     * @returns {string} Formatted message
     */
    formatUpcomingMessage(song, position = 1) {
        const songTitle = song.title || 'Your song';
        const artistText = song.artist ? `\n👤 *${song.artist}*` : '';
        
        if (position === 1) {
            return `⏭️ *Up Next*\n\n🎶 *${songTitle}*${artistText}`;
        } else {
            return `📋 *Coming Up (#${position})*\n\n🎶 *${songTitle}*${artistText}`;
        }
    }

    /**
     * Enable or disable notifications
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        logger.info(`[Notification Service] ${enabled ? 'Enabled' : 'Disabled'}`);
    }

    /**
     * Clear notification history
     */
    clearHistory() {
        this.notifiedSongs.clear();
        logger.info('[Notification Service] Cleared notification history');
    }
}

// Export singleton instance
module.exports = new NotificationService();

