/**
 * Notifications API Routes Tests
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const { createTestApp, startTestServer, makeRequest, parseJsonResponse } = require('../../helpers/test-server');
const { router } = require('../../../src/api/routes/notifications.routes');
const notificationService = require('../../../src/services/notification.service');

let testServer;
let mockNotificationService;

beforeEach(() => {
    // Create test app
    const app = createTestApp(router);
    
    // Mock notification service
    mockNotificationService = {
        isEnabled: false,
        notifiedSongs: new Map(),
        setEnabled: sinon.stub(),
        clearHistory: sinon.stub()
    };
    
    // Replace the service in the route module
    // Note: This requires the route to use dependency injection or we mock at module level
    // For now, we'll test with the real service but verify behavior
});

afterEach(async () => {
    if (testServer) {
        await testServer.close();
        testServer = null;
    }
    sinon.restore();
});

test('GET /api/notifications/status should return notification status', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'GET', '/api/notifications/status');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toHaveProperty('enabled');
    expect(data).toHaveProperty('historySize');
    expect(typeof data.enabled).toBe('boolean');
    expect(typeof data.historySize).toBe('number');
});

test('POST /api/notifications/enable should enable notifications', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/notifications/enable');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('enabled');
    expect(notificationService.isEnabled).toBe(true);
});

test('POST /api/notifications/disable should disable notifications', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/notifications/disable');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('disabled');
    expect(notificationService.isEnabled).toBe(false);
});

test('POST /api/notifications/clear should clear notification history', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Add some history first (notifiedSongs is a Set, not a Map)
    notificationService.notifiedSongs.add('song1');
    notificationService.notifiedSongs.add('song2');
    
    const response = await makeRequest(testServer.url, 'POST', '/api/notifications/clear');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('cleared');
    expect(notificationService.notifiedSongs.size).toBe(0);
});

