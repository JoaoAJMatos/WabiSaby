const express = require('express');
const mobileController = require('../controllers/mobile.controller');
const { authenticateMobile } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Mobile Routes
 * Handles mobile VIP access endpoints
 */

/**
 * POST /api/mobile/auth
 * Authenticate with token and device fingerprint
 * First access: Register fingerprint
 * Subsequent: Verify fingerprint matches
 */
router.post('/mobile/auth', mobileController.authenticate);

/**
 * GET /api/mobile/status
 * Get current song and queue (requires authentication)
 */
router.get('/mobile/status', authenticateMobile, mobileController.getStatus);

/**
 * GET /api/mobile/status/stream
 * Server-Sent Events endpoint for real-time mobile status updates
 */
router.get('/mobile/status/stream', authenticateMobile, mobileController.setupStatusSSE.bind(mobileController));

/**
 * GET /api/mobile/effects
 * Get current effects and presets (requires authentication)
 */
router.get('/mobile/effects', authenticateMobile, mobileController.getEffects);

/**
 * PUT /api/mobile/effects
 * Update effects settings (requires authentication)
 */
router.put('/mobile/effects', authenticateMobile, mobileController.updateEffects.bind(mobileController));

/**
 * POST /api/mobile/effects/preset/:presetId
 * Apply preset (requires authentication)
 */
router.post('/mobile/effects/preset/:presetId', authenticateMobile, mobileController.applyPreset.bind(mobileController));

module.exports = { router };

