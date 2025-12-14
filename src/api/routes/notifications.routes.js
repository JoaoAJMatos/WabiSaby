const express = require('express');
const notificationService = require('../../services/notification.service');
const { logger } = require('../../utils/logger');

const router = express.Router();

/**
 * Notification Routes
 * Handles notification service management endpoints
 */

/**
 * Get notification service status
 * GET /api/notifications/status
 */
router.get('/notifications/status', (req, res) => {
    res.json({ 
        enabled: notificationService.isEnabled,
        historySize: notificationService.notifiedSongs.size
    });
});

/**
 * Enable notifications
 * POST /api/notifications/enable
 */
router.post('/notifications/enable', (req, res) => {
    notificationService.setEnabled(true);
    res.json({ success: true, message: 'Notifications enabled' });
});

/**
 * Disable notifications
 * POST /api/notifications/disable
 */
router.post('/notifications/disable', (req, res) => {
    notificationService.setEnabled(false);
    res.json({ success: true, message: 'Notifications disabled' });
});

/**
 * Clear notification history
 * POST /api/notifications/clear
 */
router.post('/notifications/clear', (req, res) => {
    notificationService.clearHistory();
    res.json({ success: true, message: 'Notification history cleared' });
});

module.exports = { router };

