const express = require('express');
const volumeNormalizationController = require('../controllers/volume-normalization.controller');

const router = express.Router();

/**
 * Volume Normalization Routes
 * Manages volume normalization settings and analysis
 */

/**
 * GET /api/volume-normalization/settings
 * Get current volume normalization settings
 */
router.get('/volume-normalization/settings', volumeNormalizationController.getSettings);

/**
 * PUT /api/volume-normalization/settings
 * Update volume normalization settings
 */
router.put('/volume-normalization/settings', volumeNormalizationController.updateSettings);

/**
 * POST /api/volume-normalization/analyze/:songId
 * Manually trigger volume analysis for an existing song
 */
router.post('/volume-normalization/analyze/:songId', volumeNormalizationController.analyzeSong);

module.exports = { router };

