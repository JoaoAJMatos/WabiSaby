const express = require('express');
const statusController = require('../controllers/status.controller');

const router = express.Router();

/**
 * Status Routes
 * Handles combined status endpoint for auth, queue, and stats
 */

/**
 * Update authentication status (called from WhatsApp module for QR code)
 */
function updateAuthStatus(status, qr) {
    statusController.updateAuthStatus(status, qr);
}

/**
 * Combined Status Endpoint (Queue + Auth + Stats)
 * GET /api/status
 */
router.get('/status', statusController.getStatus.bind(statusController));

/**
 * Server-Sent Events endpoint for real-time status updates
 * GET /api/status/stream
 */
router.get('/status/stream', statusController.setupSSEConnection.bind(statusController));

module.exports = { router, updateAuthStatus };

