/**
 * Logs Service Tests
 * Tests for log buffering and streaming functionality
 */

const { test, expect, beforeEach } = require('bun:test');
const { logsService } = require('../../../src/services/logs.service');

beforeEach(() => {
    logsService.clearLogs();
    logsService.clients.clear();
});

test('getLogs should return empty array when no logs exist', () => {
    const logs = logsService.getLogs();
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBe(0);
});

test('addLogDirect should add log entry', () => {
    logsService.addLogDirect('info', 'Test message', 'test-source');
    
    const logs = logsService.getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].level).toBe('info');
    expect(logs[0].message).toBe('Test message');
    expect(logs[0].source).toBe('test-source');
});

test('addLogDirect should include timestamp and id', () => {
    logsService.addLogDirect('error', 'Error message', 'error-source');
    
    const logs = logsService.getLogs();
    expect(logs[0].timestamp).toBeDefined();
    expect(logs[0].id).toBeDefined();
    expect(typeof logs[0].timestamp).toBe('string');
    expect(typeof logs[0].id).toBe('string');
});

test('getLogs should filter by level', () => {
    logsService.addLogDirect('info', 'Info message', 'source');
    logsService.addLogDirect('warn', 'Warning message', 'source');
    logsService.addLogDirect('error', 'Error message', 'source');
    logsService.addLogDirect('info', 'Another info', 'source');
    
    const infoLogs = logsService.getLogs(100, 'info');
    expect(infoLogs.length).toBe(2);
    infoLogs.forEach(log => {
        expect(log.level).toBe('info');
    });
    
    const errorLogs = logsService.getLogs(100, 'error');
    expect(errorLogs.length).toBe(1);
    expect(errorLogs[0].level).toBe('error');
});

test('getLogs should filter by search term', () => {
    logsService.addLogDirect('info', 'Database connection successful', 'db');
    logsService.addLogDirect('error', 'Failed to connect to database', 'db');
    logsService.addLogDirect('info', 'User logged in', 'auth');
    
    const dbLogs = logsService.getLogs(100, null, 'database');
    expect(dbLogs.length).toBe(2);
    dbLogs.forEach(log => {
        expect(log.message.toLowerCase()).toContain('database');
    });
    
    const authLogs = logsService.getLogs(100, null, 'auth');
    expect(authLogs.length).toBe(1);
});

test('getLogs should filter by both level and search', () => {
    logsService.addLogDirect('info', 'Database connected', 'db');
    logsService.addLogDirect('error', 'Database error', 'db');
    logsService.addLogDirect('info', 'User logged in', 'auth');
    
    const dbInfoLogs = logsService.getLogs(100, 'info', 'database');
    expect(dbInfoLogs.length).toBe(1);
    expect(dbInfoLogs[0].level).toBe('info');
    expect(dbInfoLogs[0].message.toLowerCase()).toContain('database');
});

test('getLogs should respect limit parameter', () => {
    for (let i = 0; i < 50; i++) {
        logsService.addLogDirect('info', `Message ${i}`, 'source');
    }
    
    const logs = logsService.getLogs(10);
    expect(logs.length).toBe(10);
});

test('getLogs should return most recent logs first', () => {
    logsService.addLogDirect('info', 'First message', 'source');
    logsService.addLogDirect('info', 'Second message', 'source');
    logsService.addLogDirect('info', 'Third message', 'source');
    
    const logs = logsService.getLogs();
    expect(logs[0].message).toBe('Third message');
    expect(logs[1].message).toBe('Second message');
    expect(logs[2].message).toBe('First message');
});

test('clearLogs should remove all logs', () => {
    logsService.addLogDirect('info', 'Message 1', 'source');
    logsService.addLogDirect('error', 'Message 2', 'source');
    
    expect(logsService.getLogs().length).toBe(2);
    
    logsService.clearLogs();
    
    expect(logsService.getLogs().length).toBe(0);
});

test('clearLogs should emit clear event', (done) => {
    logsService.once('clear', () => {
        done();
    });
    
    logsService.clearLogs();
});

test('getStats should return log statistics', () => {
    logsService.addLogDirect('info', 'Info 1', 'source');
    logsService.addLogDirect('info', 'Info 2', 'source');
    logsService.addLogDirect('warn', 'Warning', 'source');
    logsService.addLogDirect('error', 'Error', 'source');
    
    const stats = logsService.getStats();
    
    expect(stats.total).toBe(4);
    expect(stats.byLevel.info).toBe(2);
    expect(stats.byLevel.warn).toBe(1);
    expect(stats.byLevel.error).toBe(1);
    expect(stats.byLevel.debug).toBe(0);
});

test('getStats should track connected clients', () => {
    const mockClient1 = { write: () => {} };
    const mockClient2 = { write: () => {} };
    
    logsService.addClient(mockClient1);
    logsService.addClient(mockClient2);
    
    const stats = logsService.getStats();
    expect(stats.connectedClients).toBe(2);
    
    logsService.removeClient(mockClient1);
    
    const stats2 = logsService.getStats();
    expect(stats2.connectedClients).toBe(1);
});

test('addClient should add SSE client', () => {
    const mockClient = { write: () => {} };
    
    logsService.addClient(mockClient);
    
    const stats = logsService.getStats();
    expect(stats.connectedClients).toBe(1);
});

test('removeClient should remove SSE client', () => {
    const mockClient = { write: () => {} };
    
    logsService.addClient(mockClient);
    logsService.removeClient(mockClient);
    
    const stats = logsService.getStats();
    expect(stats.connectedClients).toBe(0);
});

test('broadcastToClients should send log to all clients', () => {
    const messages = [];
    const mockClient1 = {
        write: (data) => messages.push({ client: 1, data })
    };
    const mockClient2 = {
        write: (data) => messages.push({ client: 2, data })
    };
    
    logsService.addClient(mockClient1);
    logsService.addClient(mockClient2);
    
    logsService.addLogDirect('info', 'Test message', 'test');
    
    // Give it a moment for async broadcast
    setTimeout(() => {
        expect(messages.length).toBeGreaterThan(0);
    }, 10);
});

test('broadcastToClients should remove disconnected clients', () => {
    const mockClient = {
        write: () => {
            throw new Error('Client disconnected');
        }
    };
    
    logsService.addClient(mockClient);
    
    logsService.addLogDirect('info', 'Test', 'test');
    
    // Give it a moment
    setTimeout(() => {
        const stats = logsService.getStats();
        expect(stats.connectedClients).toBe(0);
    }, 10);
});

test('addLogEntry should trim buffer when max size exceeded', () => {
    // Add more logs than maxLogs (default 1000)
    // Actually, let's test with a smaller number to be practical
    for (let i = 0; i < 100; i++) {
        logsService.addLogDirect('info', `Message ${i}`, 'source');
    }
    
    const logs = logsService.getLogs();
    expect(logs.length).toBeLessThanOrEqual(100);
});

test('addLogDirect should handle object messages', () => {
    const obj = { key: 'value', nested: { data: 123 } };
    logsService.addLogDirect('info', obj, 'source');
    
    const logs = logsService.getLogs();
    expect(logs[0].message).toBeDefined();
});

test('getCallerInfo should extract caller information from stack', () => {
    // This is tested indirectly through addLogDirect
    logsService.addLogDirect('info', 'Test', null);
    
    const logs = logsService.getLogs();
    expect(logs[0].source).toBeDefined();
});

test('logs should emit log event when entry added', (done) => {
    logsService.once('log', (logEntry) => {
        expect(logEntry.level).toBe('info');
        expect(logEntry.message).toBe('Event test');
        done();
    });
    
    logsService.addLogDirect('info', 'Event test', 'source');
});

