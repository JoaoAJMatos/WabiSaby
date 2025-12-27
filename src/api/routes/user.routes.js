const express = require('express');
const userController = require('../controllers/user.controller');

const router = express.Router();

/**
 * User Routes
 * Handles user-specific preferences like language
 */

/**
 * GET /api/user/language
 * Get current user's language preference
 * For web UI: uses query param or defaults to browser language
 * For authenticated requests: uses user session
 */
router.get('/user/language', userController.getLanguage);

/**
 * POST /api/user/language
 * Update user's language preference
 * Body: { language: 'en' | 'pt', userId?: string }
 */
router.post('/user/language', userController.updateLanguage);

module.exports = { router };

