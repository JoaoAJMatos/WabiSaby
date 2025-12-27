const express = require('express');
const authController = require('../controllers/auth.controller');

const router = express.Router();

/**
 * Auth Routes
 * Handles authentication and logout endpoints
 */

/**
 * POST /api/auth/logout
 * Disconnect from WhatsApp and remove auth data
 */
router.post('/auth/logout', authController.logout);

module.exports = { router };

