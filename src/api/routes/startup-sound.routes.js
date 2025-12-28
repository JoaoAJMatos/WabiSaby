const express = require('express');
const router = express.Router();
const startupSoundController = require('../controllers/startup-sound.controller');

/**
 * Startup Sound Routes
 * Handles backend playback of startup sound
 */

/**
 * POST /api/startup-sound/play
 * Play the startup sound on the backend
 */
router.post('/startup-sound/play', startupSoundController.playStartupSound);

module.exports = { router };

