const EventEmitter = require('events');

/**
 * Logs Service
 * Buffers system logs and supports real-time streaming via SSE
 */

class LogsService extends EventEmitter {
    constructor() {
        super();
        this.logs = [];
        this.maxLogs = 1000; // Keep last 1000 logs in memory
        this.clients = new Set();
        
        // Intercept console methods
        this.interceptConsole();
    }

    /**
     * Intercept console methods to capture logs
     */
    interceptConsole() {
        const originalConsole = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
            debug: console.debug
        };

        const createInterceptor = (level, originalMethod) => {
            return (...args) => {
                // Call original method
                originalMethod.apply(console, args);
                
                // Capture the log
                this.addLog(level, args);
            };
        };

        console.log = createInterceptor('info', originalConsole.log);
        console.info = createInterceptor('info', originalConsole.info);
        console.warn = createInterceptor('warn', originalConsole.warn);
        console.error = createInterceptor('error', originalConsole.error);
        console.debug = createInterceptor('debug', originalConsole.debug);
    }

    /**
     * Add a log entry (from console interception)
     */
    addLog(level, args) {
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        this.addLogEntry(level, message, this.getCallerInfo());
    }

    /**
     * Add a log entry directly (from pino logger wrapper)
     * Used to avoid circular calls through console
     */
    addLogDirect(level, message, source) {
        this.addLogEntry(level, message, source || this.getCallerInfoForLogger());
    }

    /**
     * Internal method to add a log entry
     */
    addLogEntry(level, message, source) {
        const logEntry = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            level,
            message,
            source
        };

        // Add to buffer
        this.logs.push(logEntry);
        
        // Trim buffer if needed
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Emit to connected clients
        this.emit('log', logEntry);
        this.broadcastToClients(logEntry);
    }

    /**
     * Get caller info from stack trace (for console interception)
     */
    getCallerInfo() {
        const stack = new Error().stack;
        if (!stack) return 'unknown';
        
        const lines = stack.split('\n');
        // Find the first line that's not from this file or node internals
        for (let i = 3; i < lines.length; i++) {
            const line = lines[i];
            if (!line.includes('logs.service.js') && 
                !line.includes('node:internal') &&
                !line.includes('node_modules/pino')) {
                const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
                if (match) {
                    const [, fn, file, lineNum] = match;
                    const shortFile = file.split('/').slice(-2).join('/');
                    return fn ? `${fn} (${shortFile}:${lineNum})` : `${shortFile}:${lineNum}`;
                }
            }
        }
        return 'unknown';
    }

    /**
     * Get caller info from stack trace (for pino logger wrapper)
     * Looks further up the stack to skip logger.js
     */
    getCallerInfoForLogger() {
        const stack = new Error().stack;
        if (!stack) return null;
        
        const lines = stack.split('\n');
        // Skip: Error, addLogEntry, addLogDirect, logger proxy, actual caller
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip internal files and logger
            if (line.includes('logs.service.js') || 
                line.includes('logger.js') ||
                line.includes('node:internal') ||
                line.includes('node_modules')) {
                continue;
            }
            
            const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
            if (match) {
                const [, fn, file, lineNum] = match;
                const shortFile = file.split('/').slice(-2).join('/');
                return fn ? `${fn} (${shortFile}:${lineNum})` : `${shortFile}:${lineNum}`;
            }
        }
        return null;
    }

    /**
     * Add SSE client
     */
    addClient(client) {
        this.clients.add(client);
    }

    /**
     * Remove SSE client
     */
    removeClient(client) {
        this.clients.delete(client);
    }

    /**
     * Broadcast log to all SSE clients
     */
    broadcastToClients(logEntry) {
        const data = JSON.stringify(logEntry);
        this.clients.forEach(client => {
            try {
                client.write(`data: ${data}\n\n`);
            } catch (err) {
                // Client disconnected, remove it
                this.clients.delete(client);
            }
        });
    }

    /**
     * Get recent logs
     */
    getLogs(limit = 100, level = null, search = null) {
        let filteredLogs = [...this.logs];
        
        // Filter by level
        if (level && level !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.level === level);
        }
        
        // Filter by search term
        if (search) {
            const searchLower = search.toLowerCase();
            filteredLogs = filteredLogs.filter(log => 
                log.message.toLowerCase().includes(searchLower) ||
                (log.source && log.source.toLowerCase().includes(searchLower))
            );
        }
        
        // Return most recent logs
        return filteredLogs.slice(-limit).reverse();
    }

    /**
     * Clear all logs
     */
    clearLogs() {
        this.logs = [];
        this.emit('clear');
        
        // Notify all clients
        this.clients.forEach(client => {
            try {
                client.write(`event: clear\ndata: {}\n\n`);
            } catch {
                this.clients.delete(client);
            }
        });
    }

    /**
     * Get log statistics
     */
    getStats() {
        const stats = {
            total: this.logs.length,
            byLevel: {
                debug: 0,
                info: 0,
                warn: 0,
                error: 0
            },
            connectedClients: this.clients.size
        };

        this.logs.forEach(log => {
            if (stats.byLevel[log.level] !== undefined) {
                stats.byLevel[log.level]++;
            }
        });

        return stats;
    }
}

// Singleton instance
const logsService = new LogsService();

module.exports = { logsService };

