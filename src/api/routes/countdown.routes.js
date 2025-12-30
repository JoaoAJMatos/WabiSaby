/**
 * Countdown Routes
 * API routes for countdown configuration and status
 */

const express = require('express');
const countdownController = require('../controllers/countdown.controller');

const router = express.Router();

// Get countdown status
router.get('/countdown', countdownController.getStatus.bind(countdownController));

// Update countdown configuration
router.post('/countdown', countdownController.updateConfig.bind(countdownController));

// Enable countdown
router.post('/countdown/enable', countdownController.enable.bind(countdownController));

// Disable countdown
router.post('/countdown/disable', countdownController.disable.bind(countdownController));

// Pre-fetch countdown song
router.post('/countdown/prefetch', countdownController.prefetchSong.bind(countdownController));

module.exports = { router };
