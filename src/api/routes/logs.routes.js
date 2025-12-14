const express = require('express');
const router = express.Router();
const { logsService } = require('../../services/logs.service');

/**
 * Logs API Routes
 * Provides endpoints for viewing and streaming system logs
 */

/**
 * GET /api/logs
 * Get recent logs with optional filtering
 */
router.get('/logs', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const level = req.query.level || null;
        const search = req.query.search || null;
        
        const logs = logsService.getLogs(limit, level, search);
        res.json({ logs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get logs' });
    }
});

/**
 * GET /api/logs/stream
 * Server-Sent Events endpoint for real-time log streaming
 */
router.get('/logs/stream', (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    // Send initial connection event
    res.write(`event: connected\ndata: {"status": "connected"}\n\n`);
    
    // Add this response to clients
    logsService.addClient(res);
    
    // Send recent logs as initial batch
    const recentLogs = logsService.getLogs(50);
    recentLogs.reverse().forEach(log => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
    });
    
    // Handle client disconnect
    req.on('close', () => {
        logsService.removeClient(res);
    });
    
    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
        try {
            res.write(`:heartbeat\n\n`);
        } catch {
            clearInterval(heartbeat);
            logsService.removeClient(res);
        }
    }, 30000);
    
    req.on('close', () => {
        clearInterval(heartbeat);
    });
});

/**
 * GET /api/logs/stats
 * Get log statistics
 */
router.get('/logs/stats', (req, res) => {
    try {
        const stats = logsService.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get log stats' });
    }
});

/**
 * POST /api/logs/clear
 * Clear all logs
 */
router.post('/logs/clear', (req, res) => {
    try {
        logsService.clearLogs();
        res.json({ success: true, message: 'Logs cleared' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear logs' });
    }
});

/**
 * POST /api/logs/test
 * Generate test log entries for debugging
 */
router.post('/logs/test', (req, res) => {
    console.log('Test log: INFO level message');
    console.warn('Test log: WARN level message');
    console.error('Test log: ERROR level message');
    console.debug('Test log: DEBUG level message');
    
    res.json({ success: true, message: 'Test logs generated' });
});

module.exports = { router };

