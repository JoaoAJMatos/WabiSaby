const express = require('express');
const effectsController = require('../controllers/effects.controller');

const router = express.Router();

/**
 * Effects Routes
 * Manages audio effects settings and presets
 */

/**
 * GET /api/effects
 * Get current effects settings and available presets
 */
router.get('/effects', effectsController.getEffects);

/**
 * PUT /api/effects
 * Update effects settings
 */
router.put('/effects', effectsController.updateEffects.bind(effectsController));

/**
 * POST /api/effects/preset/:presetId
 * Apply a preset
 */
router.post('/effects/preset/:presetId', effectsController.applyPreset.bind(effectsController));

/**
 * POST /api/effects/reset
 * Reset effects to defaults
 */
router.post('/effects/reset', effectsController.resetEffects.bind(effectsController));

/**
 * GET /api/effects/presets
 * Get all available presets
 */
router.get('/effects/presets', effectsController.getPresets);

/**
 * GET /api/effects/stream
 * Server-Sent Events endpoint for real-time effects updates
 * Supports both regular dashboard users and authenticated mobile users
 */
router.get('/effects/stream', effectsController.optionalMobileAuth, effectsController.setupSSEConnection);

module.exports = { router };