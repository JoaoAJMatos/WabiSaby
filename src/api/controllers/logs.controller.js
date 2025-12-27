const { logsService } = require('../../services/system/logs.service');

/**
 * Logs Controller
 * Provides endpoints for viewing and streaming system logs
 */

class LogsController {
    /**
     * Get recent logs with optional filtering
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getLogs(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const level = req.query.level || null;
            const search = req.query.search || null;
            
            const logs = logsService.getLogs(limit, level, search);
            res.json({ logs });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get logs' });
        }
    }

    /**
     * Server-Sent Events endpoint for real-time log streaming
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    streamLogs(req, res) {
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
    }

    /**
     * Get log statistics
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getStats(req, res) {
        try {
            const stats = logsService.getStats();
            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get log stats' });
        }
    }

    /**
     * Clear all logs
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    clearLogs(req, res) {
        try {
            logsService.clearLogs();
            res.json({ success: true, message: 'Logs cleared' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to clear logs' });
        }
    }

    /**
     * Generate test log entries for debugging
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    testLogs(req, res) {
        console.log('Test log: INFO level message');
        console.warn('Test log: WARN level message');
        console.error('Test log: ERROR level message');
        console.debug('Test log: DEBUG level message');
        
        res.json({ success: true, message: 'Test logs generated' });
    }
}

module.exports = new LogsController();

