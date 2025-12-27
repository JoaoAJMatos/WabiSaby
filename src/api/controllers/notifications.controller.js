const notificationService = require('../../services/system/notification.service');

/**
 * Notifications Controller
 * Handles notification service management
 */

class NotificationsController {
    /**
     * Get notification service status
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getStatus(req, res) {
        res.json({ 
            enabled: notificationService.isEnabled,
            historySize: notificationService.notifiedSongs.size
        });
    }

    /**
     * Enable notifications
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    enable(req, res) {
        notificationService.setEnabled(true);
        res.json({ success: true, message: 'Notifications enabled' });
    }

    /**
     * Disable notifications
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    disable(req, res) {
        notificationService.setEnabled(false);
        res.json({ success: true, message: 'Notifications disabled' });
    }

    /**
     * Clear notification history
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    clearHistory(req, res) {
        notificationService.clearHistory();
        res.json({ success: true, message: 'Notification history cleared' });
    }
}

module.exports = new NotificationsController();

