const express = require('express');
const vipAuthController = require('../controllers/vip-auth.controller');

const router = express.Router();

/**
 * VIP Authentication Routes
 * Handles VIP password management and verification
 */

/**
 * GET /api/vip-auth/status
 * Check if VIP password is configured
 */
router.get('/vip-auth/status', vipAuthController.getStatus);

/**
 * POST /api/vip-auth/setup
 * Set VIP password (first-time setup only)
 * Body: { password: string }
 */
router.post('/vip-auth/setup', vipAuthController.setupPassword);

/**
 * POST /api/vip-auth/verify
 * Verify VIP password for unlocking
 * Body: { password: string }
 */
router.post('/vip-auth/verify', vipAuthController.verifyPassword);

/**
 * POST /api/vip-auth/change
 * Change existing VIP password
 * Body: { currentPassword: string, newPassword: string }
 */
router.post('/vip-auth/change', vipAuthController.changePassword);

module.exports = { router };

