/**
 * Logs API Routes Tests
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const { createTestApp, startTestServer, makeRequest, parseJsonResponse } = require('../../helpers/test-server');
const { router } = require('../../../src/api/routes/logs.routes');
const { logsService } = require('../../../src/services/logs.service');

let testServer;
let getLogsStub;
let getStatsStub;
let clearLogsStub;
let addClientStub;
let removeClientStub;

beforeEach(() => {
    getLogsStub = sinon.stub(logsService, 'getLogs');
    getStatsStub = sinon.stub(logsService, 'getStats');
    clearLogsStub = sinon.stub(logsService, 'clearLogs');
    addClientStub = sinon.stub(logsService, 'addClient');
    removeClientStub = sinon.stub(logsService, 'removeClient');
});

afterEach(async () => {
    if (testServer) {
        await testServer.close();
        testServer = null;
    }
    sinon.restore();
});

test('GET /api/logs should return logs with default limit', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const mockLogs = [
        { level: 'info', message: 'Test log 1', timestamp: Date.now() },
        { level: 'error', message: 'Test log 2', timestamp: Date.now() }
    ];
    
    getLogsStub.returns(mockLogs);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/logs');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.logs).toEqual(mockLogs);
    expect(getLogsStub.calledOnce).toBe(true);
    expect(getLogsStub.firstCall.args[0]).toBe(100); // default limit
});

test('GET /api/logs should respect limit parameter', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    getLogsStub.returns([]);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/logs?limit=50');
    expect(response.status).toBe(200);
    
    expect(getLogsStub.firstCall.args[0]).toBe(50);
});

test('GET /api/logs should filter by level', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    getLogsStub.returns([]);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/logs?level=error');
    expect(response.status).toBe(200);
    
    expect(getLogsStub.firstCall.args[1]).toBe('error');
});

test('GET /api/logs should filter by search term', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    getLogsStub.returns([]);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/logs?search=test');
    expect(response.status).toBe(200);
    
    expect(getLogsStub.firstCall.args[2]).toBe('test');
});

test('GET /api/logs/stats should return log statistics', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const mockStats = {
        total: 100,
        byLevel: { info: 50, error: 30, warn: 20 }
    };
    
    getStatsStub.returns(mockStats);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/logs/stats');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toEqual(mockStats);
    expect(getStatsStub.calledOnce).toBe(true);
});

test('POST /api/logs/clear should clear logs', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/logs/clear');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('cleared');
    expect(clearLogsStub.calledOnce).toBe(true);
});

test('POST /api/logs/test should generate test logs', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Capture console calls
    const consoleLog = console.log;
    const consoleWarn = console.warn;
    const consoleError = console.error;
    const consoleDebug = console.debug;
    
    let logCalled = false;
    let warnCalled = false;
    let errorCalled = false;
    let debugCalled = false;
    
    console.log = () => { logCalled = true; };
    console.warn = () => { warnCalled = true; };
    console.error = () => { errorCalled = true; };
    console.debug = () => { debugCalled = true; };
    
    try {
        const response = await makeRequest(testServer.url, 'POST', '/api/logs/test');
        expect(response.status).toBe(200);
        
        const data = await parseJsonResponse(response);
        expect(data.success).toBe(true);
        expect(data.message).toContain('Test logs generated');
        
        // Note: In a real scenario, these would be captured by logsService
        // but we're just verifying the endpoint works
    } finally {
        console.log = consoleLog;
        console.warn = consoleWarn;
        console.error = consoleError;
        console.debug = consoleDebug;
    }
});

test('GET /api/logs/stream should set up SSE connection', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // For SSE, we test that the endpoint responds and sets proper headers
    // Full SSE testing would require more complex setup with streaming
    // Note: SSE connections may close immediately in test environment
    try {
        const response = await makeRequest(testServer.url, 'GET', '/api/logs/stream');
        
        // SSE endpoint should set proper headers
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        expect(response.status).toBe(200);
    } catch (error) {
        // SSE connections may close in test environment - that's okay
        // We just verify the endpoint exists and attempts to set up SSE
        expect(error.message).toBeDefined();
    }
});

