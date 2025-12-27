const express = require('express');
const router = express.Router();
const logsController = require('../controllers/logs.controller');

/**
 * Logs API Routes
 * Provides endpoints for viewing and streaming system logs
 */

/**
 * GET /api/logs
 * Get recent logs with optional filtering
 */
router.get('/logs', logsController.getLogs);

/**
 * GET /api/logs/stream
 * Server-Sent Events endpoint for real-time log streaming
 */
router.get('/logs/stream', logsController.streamLogs);

/**
 * GET /api/logs/stats
 * Get log statistics
 */
router.get('/logs/stats', logsController.getStats);

/**
 * POST /api/logs/clear
 * Clear all logs
 */
router.post('/logs/clear', logsController.clearLogs);

/**
 * POST /api/logs/test
 * Generate test log entries for debugging
 */
router.post('/logs/test', logsController.testLogs);

module.exports = { router };

