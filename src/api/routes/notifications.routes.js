const express = require('express');
const notificationsController = require('../controllers/notifications.controller');

const router = express.Router();

/**
 * Notification Routes
 * Handles notification service management endpoints
 */

/**
 * Get notification service status
 * GET /api/notifications/status
 */
router.get('/notifications/status', notificationsController.getStatus);

/**
 * Enable notifications
 * POST /api/notifications/enable
 */
router.post('/notifications/enable', notificationsController.enable);

/**
 * Disable notifications
 * POST /api/notifications/disable
 */
router.post('/notifications/disable', notificationsController.disable);

/**
 * Clear notification history
 * POST /api/notifications/clear
 */
router.post('/notifications/clear', notificationsController.clearHistory);

module.exports = { router };

