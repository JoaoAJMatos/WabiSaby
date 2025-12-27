const express = require('express');
const volumeController = require('../controllers/volume.controller');

const router = express.Router();

/**
 * Volume Routes
 * Manages volume control settings
 */

/**
 * GET /api/volume
 * Get current volume setting
 */
router.get('/volume', volumeController.getVolume);

/**
 * PUT /api/volume
 * Update volume (0-100)
 */
router.put('/volume', volumeController.updateVolume);

module.exports = { router };

