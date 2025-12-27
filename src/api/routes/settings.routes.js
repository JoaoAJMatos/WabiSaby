const express = require('express');
const settingsController = require('../controllers/settings.controller');

const router = express.Router();

/**
 * Settings Routes
 * Handles configuration settings management
 */

/**
 * GET /api/settings
 * Get current configuration (only editable settings)
 */
router.get('/settings', settingsController.getSettings);

/**
 * POST /api/settings
 * Update configuration settings
 */
router.post('/settings', settingsController.updateSetting);

/**
 * POST /api/settings/bulk
 * Update multiple settings at once
 */
router.post('/settings/bulk', settingsController.bulkUpdateSettings);

/**
 * POST /api/settings/reset
 * Reset all settings to their default values
 */
router.post('/settings/reset', settingsController.resetSettings);

/**
 * GET /api/settings/disk-usage
 * Get disk usage information for WabiSaby storage directories
 */
router.get('/settings/disk-usage', settingsController.getDiskUsage);

module.exports = { router };

